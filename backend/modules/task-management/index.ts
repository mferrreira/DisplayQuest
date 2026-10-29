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
import type { TaskActivitiesPort } from "@/backend/modules/task-management/application/ports/task-activities.port"
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository"
import type { TaskActivityItem, TaskActivityPort } from "@/backend/modules/task-management/application/ports/task-activity.port"
import { createPrismaTaskRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task.repository"
import { createPrismaTaskAssigneesRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-assignees.repository"
import { createPrismaTaskProgressRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-progress.repository"
import { createPrismaTaskActorsRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-actors.repository"
import { createPrismaTaskProjectsRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-projects.repository"
import { createPrismaTaskSubtasksRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-subtasks.repository"
import { createPrismaTaskActivitiesRepository } from "@/backend/modules/task-management/infrastructure/repositories/prisma-task-activities.repository"

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
  // Feed "Atividade recente": as acoes mais recentes gravadas em `history` (entityType "task").
  // `scope` recorta pelo projeto selecionado no quadro ou pelos projetos da pessoa.
  readonly listActivity: (
    limit: number,
    since?: Date,
    scope?: { actorId?: number; projectId?: number | null },
  ) => Promise<TaskActivityItem[]>
  // V6-11k: limpeza periódica do feed (cron). Apaga só `entityType "task"` mais antigo que o
  // corte; premiações e avisos do lab moram na MESMA tabela e nunca são tocados (porta documenta).
  readonly purgeTaskActivity: (cutoff: Date) => Promise<number>
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
    // V5-6 (DEC-99): a leitura da linha do cronograma que a ligação de tarefa precisa.
    activities: TaskActivitiesPort
    events?: TaskProgressEvents
    // Feed "Atividade recente": registro opcional em `history`. Sem porta, nada e gravido e a
    // leitura devolve vazio (roundtrip G4 e testes de use case seguem sem tocar em history).
    activity?: TaskActivityPort
  }) {
    const getTaskByIdUseCase = new GetTaskByIdUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
      subtasks: ports.subtasks,
      // B6-7 (D4): o escopo do GET (membro do projeto?) e decidido aqui — precisa da porta.
      actors: ports.actors,
      // DEC-189: a lista de subtasks so chega a dono/gestao — lider e criador do projeto dao
      // na decisao.
      projects: ports.projects,
    })
    const assertCanManageTasksUseCase = new AssertCanManageTasksUseCase()
    const listTasksForActorUseCase = new ListTasksForActorUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
      progress: ports.progress,
      actors: ports.actors,
      subtasks: ports.subtasks,
      // DEC-189: visibilidade de subtask por ator (lider/criador do projeto na decisao).
      projects: ports.projects,
    })
    const createTaskUseCase = new CreateTaskUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
      actors: ports.actors,
      projects: ports.projects,
      subtasks: ports.subtasks,
      activities: ports.activities,
    })
    const updateTaskUseCase = new UpdateTaskUseCase({
      tasks: ports.tasks,
      assignees: ports.assignees,
      progress: ports.progress,
      actors: ports.actors,
      projects: ports.projects,
      notifications: ports.notifications,
      subtasks: ports.subtasks,
      activities: ports.activities,
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

    // Feed "Atividade recente": os metodos mutadores registram a acao em `history` depois de o
    // use case resolver. Sem porta injetada (roundtrip G4, testes de use case), nada e gravido.
    const activity = ports.activity
    const personId = (actor: ActorRef): number | null => (actor.kind === "user" ? actor.id : null)

    this.getTaskById = (command) => getTaskByIdUseCase.execute(command)
    this.listTasksForActor = (query) => listTasksForActorUseCase.execute(query)
    this.assertCanManageTasks = (command) => assertCanManageTasksUseCase.execute(command)
    this.createTask = async (command, actor) => {
      const task = await createTaskUseCase.execute(command, actor)
      const id = personId(actor)
      if (activity && id != null && task?.id) {
        await activity.append({ taskId: task.id, taskTitle: task.title, actorId: id, action: "CREATE", toStatus: task.status, projectId: task.projectId ?? null })
      }
      return task
    }
    // Same Promise.all semantics the module has today (frozen for the routes).
    this.createTaskBacklog = (tasks, actor) => Promise.all(tasks.map((task) => createTaskUseCase.execute(task, actor)))
    this.updateTask = async (command) => {
      const task = await updateTaskUseCase.execute(command)
      const id = personId(command.actor)
      const moved = command.data.status !== undefined && command.data.status !== null
      if (activity && id != null && moved && task?.id) {
        await activity.append({ taskId: task.id, taskTitle: task.title, actorId: id, action: "MOVE", toStatus: task.status, projectId: task.projectId ?? null })
      }
      return task
    }
    this.deleteTask = (command) => deleteTaskUseCase.execute(command)
    this.completeTask = async (command) => {
      const result = await completeTaskUseCase.execute(command)
      const id = personId(command.actor)
      if (activity && id != null && result?.task?.id) {
        // O feed nao pode dizer "concluiu" quando o servidor devolveu Em Revisao (tarefa
        // delegada/de projeto — dono, 2026-10-19): quem arrasta para "Concluído" nesse caso
        // ENVIA para revisao; a conclusao de fato e a aprovacao, que grava o proprio COMPLETE.
        // O log obedece o status resultante, nao o nome do metodo.
        const landedDone = result.task.status === "done"
        await activity.append({
          taskId: result.task.id,
          taskTitle: result.task.title,
          actorId: id,
          action: landedDone ? "COMPLETE" : "MOVE",
          toStatus: result.task.status,
          projectId: result.task.projectId ?? null,
        })
      }
      return result
    }
    this.approveTask = async (command) => {
      const result = await approveTaskUseCase.execute(command)
      if (activity && result?.task?.id) {
        // A aprovacao e o momento em que a tarefa delegada termina; o feed credita a CONCLUSAO
        // a quem era responsavel, nao a quem clicou em Aprovar. O aprovador so aparece quando a
        // tarefa nao tem responsavel nenhum (fallback).
        const responsibleId =
          result.task.assignedTo ?? result.task.assigneeIds?.[0] ?? command.approverId
        await activity.append({ taskId: result.task.id, taskTitle: result.task.title, actorId: responsibleId, action: "COMPLETE", toStatus: result.task.status, projectId: result.task.projectId ?? null })
      }
      return result
    }
    this.rejectTask = async (command) => {
      const task = await rejectTaskUseCase.execute(command)
      if (activity && task?.id) {
        await activity.append({ taskId: task.id, taskTitle: task.title, actorId: command.approverId, action: "MOVE", toStatus: task.status, projectId: task.projectId ?? null })
      }
      return task
    }
    this.globalProgress = (command) => listGlobalProgressUseCase.execute(command)
    this.listActivity = async (limit, since, scope) => {
      if (!activity) return []
      let projectIds: number[] | undefined
      // Com projeto selecionado o recorte e direto; sem ele, so os projetos da pessoa (mais as
      // tarefas globais, que nao pertencem a projeto nenhum). A lista de memberships NAO e
      // consultada quando o projeto ja foi escolhido — seria trabalho jogado fora.
      if (scope?.projectId == null && scope?.actorId != null) {
        const memberships = await ports.actors.getUserProjectMemberships(scope.actorId)
        projectIds = memberships.map((membership) => membership.projectId)
      }
      return activity.listRecent(limit, since, {
        projectId: scope?.projectId ?? undefined,
        projectIds,
      })
    }
    this.purgeTaskActivity = async (cutoff) => (activity ? activity.purgeOlderThan(cutoff) : 0)
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
  /** V5-6 (DEC-99): a leitura da linha do cronograma para a ligação de tarefa. */
  activities?: TaskActivitiesPort
  /** Awards port; the composition root wires the gamification module into the publisher. */
  events?: TaskProgressEvents
  /** Feed "Atividade recente": registro/leitura em `history` (entityType "task"). */
  activity?: TaskActivityPort
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
    activities: options.activities ?? createPrismaTaskActivitiesRepository(),
    events: options.events,
    activity: options.activity,
  })
}
