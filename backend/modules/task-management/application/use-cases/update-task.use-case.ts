import {
  assertSubtasksAllowTransition,
  canManipulateStatusOnly,
  canModifyCompletedTask,
  canMoveOutOfDoneDecision,
  fallThroughStatusPatch,
  filterTaskEditFields,
  ForbiddenError,
  hasAnyRole,
  hasPermission,
  isForeignPublicMoveDenied,
  isPublicProgressOnlyUpdate,
  isReviewRequestTransition,
  isStatusOnlyUpdate,
  isCompletionTargetStatus,
  normalizeAssigneeIds,
  NotFoundError,
  progressPatchForStatus,
  resolveTaskActivityLink,
  statusOnlyPatch,
  supportsSubtasks,
  toTaskView,
  type Task,
  type TaskStatus,
  usesPublicProgressBranch,
  ValidationError,
  withActorProgress,
} from "@/backend/domain";
import type { UpdateTaskCommand } from "@/backend/modules/task-management/application/contracts";
import { requireTaskPersonActor } from "@/backend/modules/task-management/application/use-cases/internal/require-task-actor";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskActivitiesPort } from "@/backend/modules/task-management/application/ports/task-activities.port";
import type { TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port";
import type { TaskProgressEvents } from "@/backend/modules/task-management/application/ports/task-progress.events";
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import {
  attachAssignees,
  claimTaskIfUnclaimed,
  isActorAssignedToTask,
  publishTaskReviewRequest,
  syncAssignees,
} from "@/backend/modules/task-management/application/use-cases/internal/task-view";

/**
 * UpdateTaskUseCase — OND4-B3 (R2): the gateway's four update paths, rules frozen by
 * OND4-B1 and expressed through domain functions:
 *   1. PUBLIC progress-only branch: lives entirely in task_user_progress; the task row is
 *      NEVER touched; the returned view is the actor-progress clone.
 *   2. D-41 claim: pulling an UNCLAIMED task to "in-progress" makes the actor the owner.
 *   3. STATUS-ONLY branch (non-managers): requires assignment on non-public tasks;
 *      completedAt is ALWAYS rewritten; transition into in-review notifies the leader.
 *   4. Fall-through: membership gate, completed-task gate, field-by-field application
 *      (completedAt only on transitions), full-row update, assignee sync.
 *
 * B6-7 (D4): o gate de CAMPO do PUT desceu da rota para cá, na ordem medida: gate sobre o
 * corpo CRU (quem nao tem MANAGE_TASKS so edita corpo exclusivamente {status, assignedTo} —
 * 'Sem permissão para editar tarefa', medido: ate corpo VAZIO ou {points: 5} barra) -> filtro
 * allowedFields (que era da rota e veio junto) -> lookup -> decisoes internas (papéis do
 * BANCO, segunda linha — sessao e banco podem divergir). Guarda de pessoa: update tem logica
 * dependente de id e nenhuma rotina de sistema o chama; systemActor aqui e erro de wiring.
 */
export interface UpdateTaskDependencies {
  tasks: TaskRepositoryPort
  assignees: TaskAssigneesPort
  progress: TaskProgressPort
  actors: TaskActorsPort
  projects: TaskProjectsPort
  notifications: TaskNotificationsPort
  subtasks: TaskSubtasksPort
  activities: TaskActivitiesPort
  events?: TaskProgressEvents
}

export class UpdateTaskUseCase {
  constructor(private readonly dependencies: UpdateTaskDependencies) {}

  async execute(command: UpdateTaskCommand): Promise<Task> {
    const person = requireTaskPersonActor(command.actor)
    const actorId = person.id

    // gate de campo da rota legado, sobre o corpo CRU (antes do filtro e do lookup — ordem medida)
    if (!hasPermission(person.roles, "MANAGE_TASKS") && !isPublicProgressOnlyUpdate(command.data)) {
      throw new ForbiddenError("Sem permissão para editar tarefa")
    }

    const data = filterTaskEditFields(command.data)

    const existingTask = await this.dependencies.tasks.findById(command.taskId)
    if (!existingTask) {
      throw new NotFoundError("Tarefa não encontrada")
    }

    const user = await this.dependencies.actors.findById(actorId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const userRoles = user.roles || []
    const canManageTasks = hasPermission(userRoles, "MANAGE_TASKS")
    const canManageUsers = hasPermission(userRoles, "MANAGE_USERS")

    // --- 1. public progress-only branch (task_user_progress; row untouched) -----------
    if (usesPublicProgressBranch(existingTask.taskVisibility, this.dependencies.progress.isAvailable(), data)) {
      const requestedAssignee =
        data.assignedTo === undefined ? undefined : data.assignedTo === null ? null : Number(data.assignedTo)

      if (isForeignPublicMoveDenied(requestedAssignee, actorId, canManageTasks || canManageUsers)) {
        throw new ForbiddenError("Usuário não pode mover task pública em nome de outro usuário")
      }

      if (existingTask.projectId && !canManageTasks && !canManageUsers) {
        await this.ensureProjectMember(actorId, existingTask.projectId)
      }

      const actorProgressUserId =
        requestedAssignee && requestedAssignee > 0 ? requestedAssignee : actorId

      const status = String(data.status || "to-do") as TaskStatus
      const currentProgress = await this.dependencies.progress.findByTaskAndUser(
        existingTask.id!,
        actorProgressUserId,
      )
      const now = new Date()

      await this.dependencies.progress.upsert({
        taskId: existingTask.id!,
        userId: actorProgressUserId,
        ...progressPatchForStatus(currentProgress, status, now),
      })

      return withActorProgress(
        existingTask,
        { status, completedAt: status === "done" ? now : null },
        actorProgressUserId,
      )
    }

    let workingTask = existingTask

    // --- 2. D-41 claim (pull an unclaimed task to in-progress) -------------------------
    if (
      data.status === "in-progress"
      && data.assignedTo === undefined
      && (data.assigneeIds === undefined || (Array.isArray(data.assigneeIds) && data.assigneeIds.length === 0))
    ) {
      if (existingTask.projectId && !canManageTasks && !canManageUsers) {
        await this.ensureProjectMember(actorId, existingTask.projectId)
      }
      const { task: claimedTask } = await claimTaskIfUnclaimed(
        workingTask,
        actorId,
        this.dependencies.assignees,
      )
      workingTask = claimedTask
    }

    // --- 3. status-only branch for non-managers ----------------------------------------
    if (!canManageTasks && !canManageUsers && isStatusOnlyUpdate(data)) {
      const isAssigned = await isActorAssignedToTask(workingTask, actorId, this.dependencies.assignees)
      if (!canManipulateStatusOnly(workingTask.taskVisibility, isAssigned)) {
        throw new ForbiddenError("Usuário não pode manipular esta tarefa")
      }

      const nextStatus = String(data.status) as TaskStatus
      if (!nextStatus) {
        throw new ValidationError("Status inválido")
      }

      // R12 (S13): sair de `done` é gate de gestão, antes da escrita. Um responsável sem gestão
      // que já passou em `canManipulateStatusOnly` não move uma tarefa concluída para trás.
      if (workingTask.status === "done" && nextStatus !== "done") {
        const isCreatorLeader = await this.isProjectCreatorOrLeader(actorId, workingTask.projectId)
        if (!canMoveOutOfDoneDecision(userRoles, isCreatorLeader)) {
          throw new ForbiddenError("Só a gestão de tarefa pode mover uma tarefa concluída")
        }
      }

      // plan-v4 · V4-4 (DEC-57): a trava antes de qualquer escrita.
      await this.assertSubtasksAllowTransition(workingTask, nextStatus)

      const oldStatus = workingTask.status
      const patch = statusOnlyPatch(nextStatus, new Date())
      workingTask = toTaskView({ ...workingTask, ...patch })

      // R13 (S13): a saida de `done` reverte o credito de quem o recebeu, no mesmo caso de uso,
      // antes da resposta. So faz sentido para quem de fato creditou (`assignedTo`); quest global
      // nao tem premiacao de task na tabela de pontos da casa.
      if (oldStatus === "done" && nextStatus !== "done") {
        await this.reverseCompletedAward(workingTask)
      }

      if (isReviewRequestTransition(oldStatus, nextStatus) && workingTask.projectId) {
        const project = await this.dependencies.projects.findById(workingTask.projectId)
        if (project && project.leaderId) {
          await publishTaskReviewRequest(this.dependencies.notifications, this.dependencies.actors, {
            taskId: workingTask.id!,
            taskTitle: workingTask.title,
            userId: actorId,
            projectLeaderId: project.leaderId,
          })
        }
      }

      const updatedTask = await this.dependencies.tasks.update(command.taskId, workingTask)
      return await attachAssignees(updatedTask, this.dependencies.assignees)
    }

    // --- 4. fall-through -----------------------------------------------------------------
    if (!canManageTasks && !canManageUsers) {
      if (!workingTask.projectId) {
        throw new ForbiddenError("Usuário não pode modificar esta tarefa")
      }
      await this.ensureProjectMember(actorId, workingTask.projectId)
    }

    let canModifyCompleted = hasAnyRole(userRoles, ["COORDENADOR", "LABORATORISTA", "GERENTE_PROJETO", "GERENTE"])
    if (!canModifyCompleted && workingTask.projectId) {
      const project = await this.dependencies.projects.findById(workingTask.projectId)
      if (project && (project.createdBy === actorId || project.leaderId === actorId)) {
        canModifyCompleted = true
      }
    }

    if (workingTask.completed && !canModifyCompleted) {
      throw new ForbiddenError("Não é possível modificar tarefas concluídas sem permissões adequadas")
    }

    const normalizedAssigneeIds = data.assigneeIds !== undefined
      ? normalizeAssigneeIds(data)
      : undefined
    if (normalizedAssigneeIds !== undefined) {
      await this.ensureAssigneesExist(normalizedAssigneeIds)
    } else if (data.assignedTo !== undefined && data.assignedTo !== null) {
      await this.ensureAssigneesExist([Number(data.assignedTo)])
    }

    let next = { ...workingTask }

    if (data.title !== undefined) next.title = String(data.title)
    if (data.description !== undefined) next.description = String(data.description || "")
    if (data.priority !== undefined) next.priority = data.priority as typeof next.priority

    if (data.status !== undefined) {
      const oldStatus = next.status
      // plan-v4 · V4-4 (DEC-57): mesmo gate do branch status-only, para quem tem MANAGE_TASKS
      // e cai aqui. Sem isto a trava existiria só para quem não é gestor.
      await this.assertSubtasksAllowTransition(next, data.status as TaskStatus)

      const patch = fallThroughStatusPatch(oldStatus, data.status as TaskStatus, new Date())
      next = {
        ...next,
        status: patch.status,
        completed: patch.completed,
        ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
      }

      // R13 (S13): mesma reversao para quem tem MANAGE_TASKS e cai no fall-through.
      if (oldStatus === "done" && next.status !== "done") {
        await this.reverseCompletedAward(next)
      }

      if (isReviewRequestTransition(oldStatus, data.status as TaskStatus) && next.projectId) {
        const project = await this.dependencies.projects.findById(next.projectId)
        if (project && project.leaderId) {
          await publishTaskReviewRequest(this.dependencies.notifications, this.dependencies.actors, {
            taskId: next.id!,
            taskTitle: next.title,
            userId: actorId,
            projectLeaderId: project.leaderId,
          })
        }
      }
    }

    if (data.assignedTo !== undefined) {
      next.assignedTo = data.assignedTo === null ? null : Number(data.assignedTo)
    }

    if (normalizedAssigneeIds !== undefined) {
      next.assigneeIds = normalizedAssigneeIds
      next.assignedTo = normalizedAssigneeIds[0] ?? null
    } else if (data.assignedTo !== undefined) {
      next.assigneeIds = next.assignedTo ? [next.assignedTo] : []
    }

    if (data.points !== undefined) {
      const points = Number(data.points)
      if (points < 0) throw new ValidationError("Pontos não podem ser negativos")
      next.points = points
    }
    if (data.dueDate !== undefined) next.dueDate = data.dueDate ? String(data.dueDate) : null

    // V5-6 (DEC-99): a linha do cronograma. O projeto efetivo é o da tarefa — o PUT não muda
    // projeto (quirk medido: `projectId` é filtrado mas nunca aplicado), então a checagem é
    // sempre contra `next.projectId`. Ausente no corpo não apaga o vínculo: o corpo é parcial.
    if (data.activityId !== undefined) {
      const id = Number(data.activityId)
      const hasShape =
        data.activityId !== null &&
        data.activityId !== "" &&
        Number.isInteger(id) &&
        id > 0
      const activity =
        hasShape && !next.isGlobal
          ? await this.dependencies.activities.findActivityById(id)
          : null
      next.activityId = resolveTaskActivityLink({
        activityId: data.activityId,
        activity,
        projectId: next.projectId ?? null,
        isGlobal: Boolean(next.isGlobal),
      })
    }

    const updatedTask = await this.dependencies.tasks.update(command.taskId, next)

    if (normalizedAssigneeIds !== undefined) {
      await syncAssignees(command.taskId, normalizedAssigneeIds, actorId, this.dependencies.assignees)
    } else if (data.assignedTo !== undefined) {
      await syncAssignees(
        command.taskId,
        updatedTask.assignedTo ? [updatedTask.assignedTo] : [],
        actorId,
        this.dependencies.assignees,
      )
    }

    return await attachAssignees(updatedTask, this.dependencies.assignees)
  }

  private async ensureProjectMember(actorId: number, projectId: number) {
    const memberships = await this.dependencies.actors.getUserProjectMemberships(actorId)
    if (!memberships.some((membership) => membership.projectId === projectId)) {
      throw new ForbiddenError("Usuário não pertence ao projeto desta tarefa")
    }
  }

  /** R12 (S13): criador ou líder do projeto da tarefa. Sem projeto, `false`. */
  private async isProjectCreatorOrLeader(actorId: number, projectId: number | null | undefined): Promise<boolean> {
    if (projectId === null || projectId === undefined) return false
    const project = await this.dependencies.projects.findById(projectId)
    return Boolean(project) && (project!.createdBy === actorId || project!.leaderId === actorId)
  }

  /**
   * R13 (S13): a tarefa saiu de `done`. Reverte o credito do responsavel (`assignedTo`) pela
   * mesma porta de conclusao. Sem eventos (publisher de teste), nada acontece. Sem `assignedTo`,
   * nao ha quem creditou — quest global nao tem premio de task na tabela de pontos da casa.
   */
  private async reverseCompletedAward(task: Task): Promise<void> {
    const events = this.dependencies.events
    if (!events?.onTaskUncompleted || !task.assignedTo || !task.id) return
    await events.onTaskUncompleted({
      userId: task.assignedTo,
      taskId: task.id,
      projectId: task.projectId ?? null,
    })
  }

  private async ensureAssigneesExist(userIds: number[]) {
    for (const userId of userIds) {
      const assignee = await this.dependencies.actors.findById(userId)
      if (!assignee) {
        throw new NotFoundError("Usuário não encontrado")
      }
    }
  }

  /**
   * plan-v4 · V4-4 (DEC-57) — a mãe não entra em `in-review` nem em `done` enquanto houver
   * subtask aberta. A tabela é consultada só quando o destino é um dos que a trava governa:
   * mover para A Fazer, Em Andamento ou Ajustes não custa leitura nenhuma.
   *
   * O branch de progresso público não passa daqui de propósito: tarefa pública não tem subtask
   * (`supportsSubtasks`), e é a mesma razão pela qual `supportsSubtasks` é checado aqui também.
   */
  private async assertSubtasksAllowTransition(task: Task, nextStatus: TaskStatus): Promise<void> {
    if (!isCompletionTargetStatus(nextStatus)) return
    if (!supportsSubtasks(task.taskVisibility, Boolean(task.isGlobal))) return
    if (!task.id) return

    const openCount = await this.dependencies.subtasks.countOpenByTaskId(task.id)
    assertSubtasksAllowTransition(nextStatus, openCount)
  }
}
