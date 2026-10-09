import { GetTaskByIdUseCase } from "@/backend/modules/task-management/application/use-cases/get-task-by-id.use-case"
import { ListTasksForActorUseCase } from "@/backend/modules/task-management/application/use-cases/list-tasks-for-actor.use-case"
import { CreateTaskUseCase } from "@/backend/modules/task-management/application/use-cases/create-task.use-case"
import { UpdateTaskUseCase } from "@/backend/modules/task-management/application/use-cases/update-task.use-case"
import { DeleteTaskUseCase } from "@/backend/modules/task-management/application/use-cases/delete-task.use-case"
import { CompleteTaskUseCase } from "@/backend/modules/task-management/application/use-cases/complete-task.use-case"
import { ApproveTaskUseCase } from "@/backend/modules/task-management/application/use-cases/approve-task.use-case"
import { RejectTaskUseCase } from "@/backend/modules/task-management/application/use-cases/reject-task.use-case"
import { CreateTaskSubtaskUseCase } from "@/backend/modules/task-management/application/use-cases/create-task-subtask.use-case"
import { UpdateTaskSubtaskUseCase } from "@/backend/modules/task-management/application/use-cases/update-task-subtask.use-case"
import { DeleteTaskSubtaskUseCase } from "@/backend/modules/task-management/application/use-cases/delete-task-subtask.use-case"
import { AssertCanManageTasksUseCase } from "@/backend/modules/task-management/application/use-cases/assert-can-manage-tasks.use-case"
import { ListGlobalProgressUseCase, type GlobalProgressEntry } from "@/backend/modules/task-management/application/use-cases/list-global-progress.use-case"
import type { ActorRef } from "@/backend/domain"
import type { CompleteTaskCommand, CreateTaskCommand, DeleteTaskCommand, ListTasksForActorQuery, SubtaskMutationResult, UpdateTaskCommand } from "@/backend/modules/task-management/application/contracts"
import type { CreateTaskSubtaskCommand } from "@/backend/modules/task-management/application/use-cases/create-task-subtask.use-case"
import type { DeleteTaskSubtaskCommand } from "@/backend/modules/task-management/application/use-cases/delete-task-subtask.use-case"
import type { UpdateTaskSubtaskCommand } from "@/backend/modules/task-management/application/use-cases/update-task-subtask.use-case"
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository"
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port"
import type { TaskNotificationEvent, TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port"
import type { TaskProgressEvents } from "@/backend/modules/task-management/application/ports/task-progress.events"
import type { TaskCompletionResult } from "@/backend/modules/task-management/application/contracts"
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository"
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port"
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository"
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository"
import { createPrismaTaskRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task.repository"
import { createPrismaTaskAssigneesRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-assignees.repository"
import { createPrismaTaskProgressRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-progress.repository"
import { createPrismaTaskActorsRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-actors.repository"
import { createPrismaTaskProjectsRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-projects.repository"
import { createPrismaTaskSubtasksRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-subtasks.repository"

/**
 * TaskManagementModule — public surface unchanged for the routes (OND4-B3). The rules now
 * live in the use cases over repository ports (DEC-15/17); the legacy TaskServiceGateway
 * was removed in OND9-B1 (repo-cleanup B8, 2026-10-01) together with the golden/contract
 * seam — old behavior preserved in git (tag `pre-cleanup`).
 */
export class TaskManagementModule {
  // B6-7 (D4): os comandos das 3 rotas migradas carregam ActorRef; o gate e dos use cases.
  readonly getTaskById: (command: { actor: ActorRef; taskId: number }) => Promise<any>
  readonly listTasksForActor: (query: ListTasksForActorQuery) => Promise<any[]>
  readonly assertCanManageTasks: (command: { actor: ActorRef }) => void
  readonly createTask: (command: CreateTaskCommand, actor: ActorRef) => Promise<any>
  readonly createTaskBacklog: (tasks: CreateTaskCommand[], actor: ActorRef) => Promise<any[]>
  readonly updateTask: (command: UpdateTaskCommand) => Promise<any>
  readonly deleteTask: (command: DeleteTaskCommand) => Promise<void>
  // plan-v3 OND4-A: `Promise<any>` → o contrato real. A rota consome `result.task.toJSON()` e
  // repassa `awardedTo`/`awardedPoints`; tipar aqui é o que impede a próxima rota de voltar a
  // ler `task.points` e mentir sobre o prêmio (foi o que a rota de conclusão registrava).
  readonly completeTask: (command: CompleteTaskCommand) => Promise<TaskCompletionResult>
  readonly approveTask: (command: { taskId: number; approverId: number }) => Promise<TaskCompletionResult>
  readonly rejectTask: (command: { taskId: number; approverId: number; reason?: string }) => Promise<any>
  readonly globalProgress: (command: { actor: ActorRef }) => Promise<GlobalProgressEntry[]>
  // plan-v4 · V4-4 — subtasks. Devolvem a mãe junto com a subtask porque as duas consequências
  // de mexer numa subtask são da mãe: a base do prêmio muda, e a última concluída move a mãe.
  readonly createTaskSubtask: (command: CreateTaskSubtaskCommand) => Promise<SubtaskMutationResult>
  readonly updateTaskSubtask: (command: UpdateTaskSubtaskCommand) => Promise<SubtaskMutationResult>
  readonly deleteTaskSubtask: (command: DeleteTaskSubtaskCommand) => Promise<SubtaskMutationResult>

  constructor(ports: {
    tasks: TaskRepositoryPort
    assignees: TaskAssigneesPort
    progress: TaskProgressPort
    actors: TaskActorsPort
    projects: TaskProjectsPort
    notifications: TaskNotificationsPort
    subtasks: TaskSubtasksPort
    events?: TaskProgressEvents
  }) {
    const getTaskByIdUseCase = new GetTaskByIdUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
      subtasks: ports.subtasks,
      // B6-7 (D4): o escopo do GET (membro do projeto?) e decidido aqui — precisa da porta.
      actors: ports.actors,
    })
    const assertCanManageTasksUseCase = new AssertCanManageTasksUseCase()
    const listTasksForActorUseCase = new ListTasksForActorUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
      progress: ports.progress,
      actors: ports.actors,
      subtasks: ports.subtasks,
    })
    const createTaskUseCase = new CreateTaskUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
      actors: ports.actors,
      projects: ports.projects,
      subtasks: ports.subtasks,
    })
    const updateTaskUseCase = new UpdateTaskUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
      progress: ports.progress,
      actors: ports.actors,
      projects: ports.projects,
      notifications: ports.notifications,
      subtasks: ports.subtasks,
    })
    const deleteTaskUseCase = new DeleteTaskUseCase(ports.tasks)
    const completeTaskUseCase = new CompleteTaskUseCase(
      {
        tasks: ports.tasks,
        assignees: ports.assignees,
        progress: ports.progress,
        actors: ports.actors,
        projects: ports.projects,
        subtasks: ports.subtasks,
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
        subtasks: ports.subtasks,
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
    const createTaskSubtaskUseCase = new CreateTaskSubtaskUseCase({
      tasks: ports.tasks,
      subtasks: ports.subtasks,
      assignees: ports.assignees,
      actors: ports.actors,
      projects: ports.projects,
    })
    const updateTaskSubtaskUseCase = new UpdateTaskSubtaskUseCase({
      tasks: ports.tasks,
      subtasks: ports.subtasks,
      assignees: ports.assignees,
      actors: ports.actors,
      projects: ports.projects,
      notifications: ports.notifications,
    })
    const deleteTaskSubtaskUseCase = new DeleteTaskSubtaskUseCase({
      tasks: ports.tasks,
      subtasks: ports.subtasks,
      assignees: ports.assignees,
      actors: ports.actors,
      projects: ports.projects,
    })

    this.getTaskById = (command) => getTaskByIdUseCase.execute(command)
    this.listTasksForActor = (query) => listTasksForActorUseCase.execute(query)
    this.assertCanManageTasks = (command) => assertCanManageTasksUseCase.execute(command)
    this.createTask = (command, actor) => createTaskUseCase.execute(command, actor)
    // Same Promise.all semantics the module has today (frozen for the routes).
    this.createTaskBacklog = (tasks, actor) => Promise.all(tasks.map((task) => createTaskUseCase.execute(task, actor)))
    this.updateTask = (command) => updateTaskUseCase.execute(command)
    this.deleteTask = (command) => deleteTaskUseCase.execute(command)
    this.completeTask = (command) => completeTaskUseCase.execute(command)
    this.approveTask = (command) => approveTaskUseCase.execute(command)
    this.rejectTask = (command) => rejectTaskUseCase.execute(command)
    this.globalProgress = (command) => listGlobalProgressUseCase.execute(command)
    this.createTaskSubtask = (command) => createTaskSubtaskUseCase.execute(command)
    this.updateTaskSubtask = (command) => updateTaskSubtaskUseCase.execute(command)
    this.deleteTaskSubtask = (command) => deleteTaskSubtaskUseCase.execute(command)
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
  /** plan-v4 · V4-4: a costura das subtasks (DEC-78). */
  subtasks?: TaskSubtasksPort
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
    subtasks: options.subtasks ?? createPrismaTaskSubtasksRepository(),
    events: options.events,
  })
}
