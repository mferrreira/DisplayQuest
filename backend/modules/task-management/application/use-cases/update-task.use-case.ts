import {
  canManipulateStatusOnly,
  canModifyCompletedTask,
  fallThroughStatusPatch,
  ForbiddenError,
  hasAnyRole,
  hasPermission,
  isForeignPublicMoveDenied,
  isReviewRequestTransition,
  isStatusOnlyUpdate,
  normalizeAssigneeIds,
  NotFoundError,
  progressPatchForStatus,
  statusOnlyPatch,
  systemActor,
  toTaskView,
  type Task,
  type TaskStatus,
  usesPublicProgressBranch,
  ValidationError,
  withActorProgress,
} from "@/backend/domain";
import type { UpdateTaskCommand } from "@/backend/modules/task-management/application/contracts";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port";
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import {
  attachAssignees,
  claimTaskIfUnclaimed,
  isActorAssignedToTask,
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
 */
export interface UpdateTaskDependencies {
  tasks: TaskRepositoryPort
  assignees: TaskAssigneesPort
  progress: TaskProgressPort
  actors: TaskActorsPort
  projects: TaskProjectsPort
  notifications: TaskNotificationsPort
}

export class UpdateTaskUseCase {
  constructor(private readonly dependencies: UpdateTaskDependencies) {}

  async execute(command: UpdateTaskCommand): Promise<Task> {
    const existingTask = await this.dependencies.tasks.findById(command.taskId)
    if (!existingTask) {
      throw new NotFoundError("Tarefa não encontrada")
    }

    const user = await this.dependencies.actors.findById(command.actorId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const data = command.data
    const userRoles = user.roles || []
    const canManageTasks = hasPermission(userRoles, "MANAGE_TASKS")
    const canManageUsers = hasPermission(userRoles, "MANAGE_USERS")

    // --- 1. public progress-only branch (task_user_progress; row untouched) -----------
    if (usesPublicProgressBranch(existingTask.taskVisibility, this.dependencies.progress.isAvailable(), data)) {
      const requestedAssignee =
        data.assignedTo === undefined ? undefined : data.assignedTo === null ? null : Number(data.assignedTo)

      if (isForeignPublicMoveDenied(requestedAssignee, command.actorId, canManageTasks || canManageUsers)) {
        throw new ForbiddenError("Usuário não pode mover task pública em nome de outro usuário")
      }

      if (existingTask.projectId && !canManageTasks && !canManageUsers) {
        await this.ensureProjectMember(command.actorId, existingTask.projectId)
      }

      const actorProgressUserId =
        requestedAssignee && requestedAssignee > 0 ? requestedAssignee : command.actorId

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
        await this.ensureProjectMember(command.actorId, existingTask.projectId)
      }
      const { task: claimedTask } = await claimTaskIfUnclaimed(
        workingTask,
        command.actorId,
        this.dependencies.assignees,
      )
      workingTask = claimedTask
    }

    // --- 3. status-only branch for non-managers ----------------------------------------
    if (!canManageTasks && !canManageUsers && isStatusOnlyUpdate(data)) {
      const isAssigned = await isActorAssignedToTask(workingTask, command.actorId, this.dependencies.assignees)
      if (!canManipulateStatusOnly(workingTask.taskVisibility, isAssigned)) {
        throw new ForbiddenError("Usuário não pode manipular esta tarefa")
      }

      const nextStatus = String(data.status) as TaskStatus
      if (!nextStatus) {
        throw new ValidationError("Status inválido")
      }

      const oldStatus = workingTask.status
      const patch = statusOnlyPatch(nextStatus, new Date())
      workingTask = toTaskView({ ...workingTask, ...patch })

      if (isReviewRequestTransition(oldStatus, nextStatus) && workingTask.projectId) {
        const project = await this.dependencies.projects.findById(workingTask.projectId)
        if (project && project.leaderId) {
          await this.publishTaskReviewRequest(
            workingTask.id!,
            workingTask.title,
            command.actorId,
            project.leaderId,
          )
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
      await this.ensureProjectMember(command.actorId, workingTask.projectId)
    }

    let canModifyCompleted = hasAnyRole(userRoles, ["COORDENADOR", "LABORATORISTA", "GERENTE_PROJETO", "GERENTE"])
    if (!canModifyCompleted && workingTask.projectId) {
      const project = await this.dependencies.projects.findById(workingTask.projectId)
      if (project && (project.createdBy === command.actorId || project.leaderId === command.actorId)) {
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
      const patch = fallThroughStatusPatch(oldStatus, data.status as TaskStatus, new Date())
      next = {
        ...next,
        status: patch.status,
        completed: patch.completed,
        ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
      }

      if (isReviewRequestTransition(oldStatus, data.status as TaskStatus) && next.projectId) {
        const project = await this.dependencies.projects.findById(next.projectId)
        if (project && project.leaderId) {
          await this.publishTaskReviewRequest(
            next.id!,
            next.title,
            command.actorId,
            project.leaderId,
          )
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

    const updatedTask = await this.dependencies.tasks.update(command.taskId, next)

    if (normalizedAssigneeIds !== undefined) {
      await syncAssignees(command.taskId, normalizedAssigneeIds, command.actorId, this.dependencies.assignees)
    } else if (data.assignedTo !== undefined) {
      await syncAssignees(
        command.taskId,
        updatedTask.assignedTo ? [updatedTask.assignedTo] : [],
        command.actorId,
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

  private async ensureAssigneesExist(userIds: number[]) {
    for (const userId of userIds) {
      const assignee = await this.dependencies.actors.findById(userId)
      if (!assignee) {
        throw new NotFoundError("Usuário não encontrado")
      }
    }
  }

  private async publishTaskReviewRequest(
    taskId: number,
    taskTitle: string,
    userId: number,
    projectLeaderId: number,
  ) {
    try {
      const user = await this.dependencies.actors.findById(userId)
      const userName = user?.name || "Um usuário"
      await this.dependencies.notifications.publishEvent({
        eventType: "TASK_REVIEW_REQUEST",
        title: "Tarefa em Revisão",
        message: `${userName} marcou a tarefa "${taskTitle}" como "Em Revisão"`,
        data: { taskId, taskTitle, userId, userName },
        triggeredByUserId: userId,
        audience: { mode: "USER_IDS", userIds: [projectLeaderId] },
        actor: systemActor("SYSTEM_EVENT"),
      })
    } catch (error) {
      console.error("Erro ao publicar notificação TASK_REVIEW_REQUEST:", error)
    }
  }
}
