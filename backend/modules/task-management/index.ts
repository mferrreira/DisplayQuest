import { GetTaskByIdUseCase } from "@/backend/modules/task-management/application/use-cases/get-task-by-id.use-case"
import { ListTasksForActorUseCase } from "@/backend/modules/task-management/application/use-cases/list-tasks-for-actor.use-case"
import { ListActorProjectIdsUseCase } from "@/backend/modules/task-management/application/use-cases/list-actor-project-ids.use-case"
import { CreateTaskUseCase } from "@/backend/modules/task-management/application/use-cases/create-task.use-case"
import { UpdateTaskUseCase } from "@/backend/modules/task-management/application/use-cases/update-task.use-case"
import { DeleteTaskUseCase } from "@/backend/modules/task-management/application/use-cases/delete-task.use-case"
import { CompleteTaskUseCase } from "@/backend/modules/task-management/application/use-cases/complete-task.use-case"
import { ApproveTaskUseCase } from "@/backend/modules/task-management/application/use-cases/approve-task.use-case"
import { RejectTaskUseCase } from "@/backend/modules/task-management/application/use-cases/reject-task.use-case"
import { ListGlobalProgressUseCase, type GlobalProgressEntry } from "@/backend/modules/task-management/application/use-cases/list-global-progress.use-case"
import type { CreateTaskCommand } from "@/backend/modules/task-management/application/contracts"
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository"
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port"
import type { TaskNotificationEvent, TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port"
import type { TaskProgressEvents } from "@/backend/modules/task-management/application/ports/task-progress.events"
import type { TaskCompletionResult } from "@/backend/modules/task-management/application/contracts"
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository"
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port"
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository"
import { createPrismaTaskRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task.repository"
import { createPrismaTaskAssigneesRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-assignees.repository"
import { createPrismaTaskProgressRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-progress.repository"
import { createPrismaTaskActorsRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-actors.repository"
import { createPrismaTaskProjectsRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-projects.repository"

/**
 * TaskManagementModule — public surface unchanged for the routes (OND4-B3). The rules now
 * live in the use cases over repository ports (DEC-15/17); the legacy TaskServiceGateway
 * was removed in OND9-B1 (repo-cleanup B8, 2026-10-01) together with the golden/contract
 * seam — old behavior preserved in git (tag `pre-cleanup`).
 */
export class TaskManagementModule {
  readonly getTaskById: (taskId: number) => Promise<any>
  readonly listTasksForActor: (query: { actorId: number; actorRoles: string[]; projectId?: number }) => Promise<any[]>
  readonly listActorProjectIds: (actorId: number) => Promise<number[]>
  readonly createTask: (command: CreateTaskCommand, actorId: number) => Promise<any>
  readonly createTaskBacklog: (tasks: CreateTaskCommand[], actorId: number) => Promise<any[]>
  readonly updateTask: (command: { taskId: number; actorId: number; data: Record<string, unknown> }) => Promise<any>
  readonly deleteTask: (command: { taskId: number; actorId: number }) => Promise<void>
  // plan-v3 OND4-A: `Promise<any>` → o contrato real. A rota consome `result.task.toJSON()` e
  // repassa `awardedTo`/`awardedPoints`; tipar aqui é o que impede a próxima rota de voltar a
  // ler `task.points` e mentir sobre o prêmio (foi o que a rota de conclusão registrava).
  readonly completeTask: (command: { taskId: number; userId: number }) => Promise<TaskCompletionResult>
  readonly approveTask: (command: { taskId: number; approverId: number }) => Promise<TaskCompletionResult>
  readonly rejectTask: (command: { taskId: number; approverId: number; reason?: string }) => Promise<any>
  readonly globalProgress: () => Promise<GlobalProgressEntry[]>

  constructor(ports: {
    tasks: TaskRepositoryPort
    assignees: TaskAssigneesPort
    progress: TaskProgressPort
    actors: TaskActorsPort
    projects: TaskProjectsPort
    notifications: TaskNotificationsPort
    events?: TaskProgressEvents
  }) {
    const getTaskByIdUseCase = new GetTaskByIdUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
    })
    const listTasksForActorUseCase = new ListTasksForActorUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
      progress: ports.progress,
      actors: ports.actors,
    })
    const listActorProjectIdsUseCase = new ListActorProjectIdsUseCase(ports.actors)
    const createTaskUseCase = new CreateTaskUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
      actors: ports.actors,
      projects: ports.projects,
    })
    const updateTaskUseCase = new UpdateTaskUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
      progress: ports.progress,
      actors: ports.actors,
      projects: ports.projects,
      notifications: ports.notifications,
    })
    const deleteTaskUseCase = new DeleteTaskUseCase(ports.tasks)
    const completeTaskUseCase = new CompleteTaskUseCase(
      {
        tasks: ports.tasks,
        assignees: ports.assignees,
        progress: ports.progress,
        actors: ports.actors,
        projects: ports.projects,
      },
      ports.events,
    )
    const approveTaskUseCase = new ApproveTaskUseCase(
      {
        tasks: ports.tasks,
        assignees: ports.assignees,
        actors: ports.actors,
        projects: ports.projects,
        notifications: ports.notifications,
      },
      ports.events,
    )
    const rejectTaskUseCase = new RejectTaskUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
      actors: ports.actors,
      projects: ports.projects,
      notifications: ports.notifications,
    })
    const listGlobalProgressUseCase = new ListGlobalProgressUseCase({
      tasks: ports.tasks,
      actors: ports.actors,
      progress: ports.progress,
    })

    this.getTaskById = (taskId) => getTaskByIdUseCase.execute(taskId)
    this.listTasksForActor = (query) => listTasksForActorUseCase.execute(query)
    this.listActorProjectIds = (actorId) => listActorProjectIdsUseCase.execute(actorId)
    this.createTask = (command, actorId) => createTaskUseCase.execute(command, actorId)
    // Same Promise.all semantics the module has today (frozen for the routes).
    this.createTaskBacklog = (tasks, actorId) => Promise.all(tasks.map((task) => createTaskUseCase.execute(task, actorId)))
    this.updateTask = (command) => updateTaskUseCase.execute(command)
    this.deleteTask = (command) => deleteTaskUseCase.execute(command)
    this.completeTask = (command) => completeTaskUseCase.execute(command)
    this.approveTask = (command) => approveTaskUseCase.execute(command)
    this.rejectTask = (command) => rejectTaskUseCase.execute(command)
    this.globalProgress = () => listGlobalProgressUseCase.execute()
  }
}

export interface TaskManagementModulePorts {
  /** Primary seam (OND4-B3, DEC-17): inject fake ports in tests. */
  tasks?: TaskRepositoryPort
  assignees?: TaskAssigneesPort
  progress?: TaskProgressPort
  actors?: TaskActorsPort
  projects?: TaskProjectsPort
  notifications?: TaskNotificationsPort
  /** Awards port; the composition root wires the gamification module into the publisher. */
  events?: TaskProgressEvents
}

/**
 * repo-cleanup B7 (D7): o default de notifications deixou de ser o factory cruzado
 * createNotificationsModule() (import proibido pela RG-03 — módulo chamando módulo fora
 * do composition root). Sem porta injetada, o default é o no-op da casa (padrão
 * Unwired, ver lab-operations): eventos logados e descartados. A composition root
 * sempre injeta a porta real; testes que exercitam publicação injetam explicitamente
 * (tasks-roundtrip injeta createNotificationsModule()).
 */
class UnwiredTaskNotifications implements TaskNotificationsPort {
  async publishEvent(event: TaskNotificationEvent): Promise<void> {
    console.warn(
      `[task-management] notifications nao conectado — evento ${event.eventType} descartado.`,
    )
  }
}

export function createTaskManagementModule(options: TaskManagementModulePorts = {}) {
  return new TaskManagementModule({
    tasks: options.tasks ?? createPrismaTaskRepository(),
    assignees: options.assignees ?? createPrismaTaskAssigneesRepository(),
    progress: options.progress ?? createPrismaTaskProgressRepository(),
    actors: options.actors ?? createPrismaTaskActorsRepository(),
    projects: options.projects ?? createPrismaTaskProjectsRepository(),
    notifications: options.notifications ?? new UnwiredTaskNotifications(),
    events: options.events,
  })
}
