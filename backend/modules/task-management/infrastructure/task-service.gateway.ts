import { Task } from "@/backend/models/Task"
import { TaskRepository } from "@/backend/repositories/TaskRepository"
import { TaskAssigneeRepository } from "@/backend/repositories/TaskAssigneeRepository"
import { TaskUserProgressRepository } from "@/backend/repositories/TaskUserProgressRepository"
import { UserRepository } from "@/backend/repositories/UserRepository"
import { ProjectRepository } from "@/backend/repositories/ProjectRepository"
import type { NotificationsModule } from "@/backend/modules/notifications"
import type { IdentityAccessModule } from "@/backend/modules/identity-access"
import type { TaskProgressEvents } from "@/backend/modules/task-management/application/ports/task-progress.events"
import type {
  ApproveTaskCommand,
  CompleteTaskCommand,
  CreateTaskCommand,
  DeleteTaskCommand,
  RejectTaskCommand,
  UpdateTaskCommand,
} from "@/backend/modules/task-management/application/contracts"
import type { TaskManagementGateway } from "@/backend/modules/task-management/application/ports/task-management.gateway"

export class TaskServiceGateway implements TaskManagementGateway {
  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly taskAssigneeRepository: TaskAssigneeRepository,
    private readonly taskUserProgressRepository: TaskUserProgressRepository,
    private readonly userRepository: UserRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly notificationsModule: NotificationsModule,
    private readonly identityAccess: IdentityAccessModule,
    private readonly taskProgressEvents: TaskProgressEvents,
  ) {}

  async getTaskById(taskId: number) {
    const task = await this.taskRepository.findById(taskId)
    if (!task) return null
    return await this.attachAssigneeIds(task)
  }

  async listTasksForUser(actorId: number, actorRoles: string[]) {
    const hasManageTasksPermission = this.identityAccess.hasAnyRole(actorRoles, [
      "COORDENADOR",
      "GERENTE",
      "COLABORADOR",
    ])

    if (hasManageTasksPermission) {
      return await this.taskRepository.findAll()
    }

    const [assignedTasks, memberships, assignedTaskIds] = await Promise.all([
      this.taskRepository.findByAssigneeId(actorId),
      this.userRepository.getUserProjectMemberships(actorId),
      this.taskAssigneeRepository.isAvailable()
        ? this.taskAssigneeRepository.listTaskIdsByUserId(actorId)
        : Promise.resolve([]),
    ])

    const allTasks = await this.taskRepository.findAll()
    const projectIds = new Set(memberships.map((membership) => membership.projectId))
    const assignedTaskIdSet = new Set(assignedTaskIds)

    const visibleProjectTasks = allTasks.filter((task) => task.projectId && projectIds.has(task.projectId))
    const explicitlyAssignedTasks = allTasks.filter((task) => task.id && assignedTaskIdSet.has(task.id))

    return dedupeTasksById([...assignedTasks, ...explicitlyAssignedTasks, ...visibleProjectTasks])
  }

  async listGlobalTasks() {
    const tasks = await this.taskRepository.findAll()
    return tasks.filter((task) => task.isGlobal || (task.taskVisibility === "public" && !task.projectId))
  }

  async listActorProjectIds(actorId: number) {
    const memberships = await this.userRepository.getUserProjectMemberships(actorId)
    return memberships.map((membership) => membership.projectId)
  }

  async createTask(command: CreateTaskCommand, actorId: number) {
    const creator = await this.userRepository.findById(actorId)
    if (!creator) {
      throw new Error("Criador não encontrado")
    }

    const data = { ...command }
    const normalizedAssigneeIds = this.normalizeAssigneeIds(data)

    if (data.isGlobal) {
      if (!this.identityAccess.hasPermission(creator.roles, "MANAGE_USERS")) {
        throw new Error("Usuário não tem permissão para criar quests globais")
      }
      data.assignedTo = null
      data.projectId = null
      data.taskVisibility = "public"
      data.assigneeIds = []
    } else {
      if (data.projectId) {
        const project = await this.projectRepository.findById(data.projectId)
        if (!project) {
          throw new Error("Projeto não encontrado")
        }
      }

      await this.ensureAssigneesExist(normalizedAssigneeIds.length > 0 ? normalizedAssigneeIds : (data.assignedTo ? [data.assignedTo] : []))
      if (normalizedAssigneeIds.length > 0) {
        data.assignedTo = normalizedAssigneeIds[0]
        data.assigneeIds = normalizedAssigneeIds
      }
    }

    const task = Task.create(data)
    const createdTask = await this.taskRepository.create(task)

    if (!data.isGlobal) {
      const assigneeIdsToPersist = normalizedAssigneeIds.length > 0
        ? normalizedAssigneeIds
        : (createdTask.assignedTo ? [createdTask.assignedTo] : [])
      await this.syncTaskAssignees(createdTask.id!, assigneeIdsToPersist, actorId)
      createdTask.assigneeIds = assigneeIdsToPersist
      createdTask.assignedTo = assigneeIdsToPersist[0] ?? null
    } else {
      createdTask.assigneeIds = []
      createdTask.assignedTo = null
    }

    return createdTask
  }

  async createTaskBacklog(tasks: CreateTaskCommand[], actorId: number) {
    const createdTasks: Task[] = []
    for (const task of tasks) {
      createdTasks.push(await this.createTask(task, actorId))
    }
    return createdTasks
  }

  async updateTask(command: UpdateTaskCommand) {
    const existingTask = await this.taskRepository.findById(command.taskId)
    if (!existingTask) {
      throw new Error("Tarefa não encontrada")
    }

    const user = await this.userRepository.findById(command.actorId)
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    const data = command.data
    const userRoles = user.roles || []
    const canManageTasks = this.identityAccess.hasPermission(userRoles, "MANAGE_TASKS")
    const canManageUsers = this.identityAccess.hasPermission(userRoles, "MANAGE_USERS")

    if (
      existingTask.taskVisibility === "public"
      && this.taskUserProgressRepository.isAvailable()
      && isPublicProgressOnlyUpdate(data)
    ) {
      const requestedAssignee = data.assignedTo === undefined ? undefined : (data.assignedTo === null ? null : Number(data.assignedTo))
      if (requestedAssignee !== undefined && requestedAssignee !== null && requestedAssignee !== command.actorId && !canManageTasks && !canManageUsers) {
        throw new Error("Usuário não pode mover task pública em nome de outro usuário")
      }

      if (existingTask.projectId && !canManageTasks && !canManageUsers) {
        const memberships = await this.userRepository.getUserProjectMemberships(command.actorId)
        const isMember = memberships.some((membership) => membership.projectId === existingTask.projectId)
        if (!isMember) {
          throw new Error("Usuário não pertence ao projeto desta tarefa")
        }
      }

      const actorProgressUserId =
        requestedAssignee && requestedAssignee > 0 ? requestedAssignee : command.actorId

      const status = String(data.status || "to-do") as Task["status"]
      const currentProgress = await this.taskUserProgressRepository.findByTaskAndUser(existingTask.id!, actorProgressUserId)
      const now = new Date()

      await this.taskUserProgressRepository.upsertForTaskUser({
        taskId: existingTask.id!,
        userId: actorProgressUserId,
        status,
        pickedAt: currentProgress?.pickedAt ?? (status !== "to-do" ? now : null),
        completedAt: status === "done" ? now : null,
        awardedPoints: currentProgress?.awardedPoints ?? 0,
      })

      return this.withActorProgress(existingTask, {
        status,
        completedAt: status === "done" ? now : null,
      }, actorProgressUserId)
    }

    if (!canManageTasks && !canManageUsers && isStatusOnlyUpdate(data)) {
      const canManipulate =
        existingTask.taskVisibility !== "public"
        && await this.isActorAllowedToManipulateDelegatedTask(existingTask, command.actorId)
      if (!canManipulate) {
        throw new Error("Usuário não pode manipular esta tarefa")
      }

      const nextStatus = String(data.status) as Task["status"]
      if (!nextStatus) {
        throw new Error("Status inválido")
      }

      const oldStatus = existingTask.status
      existingTask.status = nextStatus
      existingTask.completed = nextStatus === "done"
      existingTask.completedAt = nextStatus === "done" ? new Date() : null

      if (oldStatus !== "in-review" && nextStatus === "in-review" && existingTask.projectId) {
        const project = await this.projectRepository.findById(existingTask.projectId)
        if (project && project.leaderId) {
          await this.publishTaskReviewRequest(
            existingTask.id!,
            existingTask.title,
            command.actorId,
            project.leaderId,
          )
        }
      }

      const updatedTask = await this.taskRepository.update(command.taskId, existingTask)
      return await this.attachAssigneeIds(updatedTask)
    }

    let canModifyCompleted = this.identityAccess.hasAnyRole(userRoles, [
      "COORDENADOR",
      "LABORATORISTA",
      "GERENTE_PROJETO",
      "GERENTE",
    ])

    if (!canModifyCompleted && existingTask.projectId) {
      const project = await this.projectRepository.findById(existingTask.projectId)
      if (project && (project.createdBy === command.actorId || project.leaderId === command.actorId)) {
        canModifyCompleted = true
      }
    }

    if (existingTask.completed && !canModifyCompleted) {
      throw new Error("Não é possível modificar tarefas concluídas sem permissões adequadas")
    }

    const normalizedAssigneeIds = data.assigneeIds !== undefined
      ? this.normalizeAssigneeIds(data)
      : undefined
    if (normalizedAssigneeIds !== undefined) {
      await this.ensureAssigneesExist(normalizedAssigneeIds)
    } else if (data.assignedTo !== undefined && data.assignedTo !== null) {
      await this.ensureAssigneesExist([Number(data.assignedTo)])
    }

    if (data.title !== undefined) existingTask.title = String(data.title)
    if (data.description !== undefined) existingTask.description = String(data.description || "")
    if (data.priority !== undefined) existingTask.priority = data.priority as any

    if (data.status !== undefined) {
      const oldStatus = existingTask.status
      existingTask.status = data.status as any
      const isDone = data.status === "done"
      existingTask.completed = isDone
      if (isDone && oldStatus !== "done") {
        existingTask.completedAt = new Date()
      }
      if (!isDone && oldStatus === "done") {
        existingTask.completedAt = null
      }

      if (oldStatus !== "in-review" && data.status === "in-review" && existingTask.projectId) {
        const project = await this.projectRepository.findById(existingTask.projectId)
        if (project && project.leaderId) {
          await this.publishTaskReviewRequest(
            existingTask.id!,
            existingTask.title,
            command.actorId,
            project.leaderId,
          )
        }
      }
    }

    if (data.assignedTo !== undefined) {
      if (data.assignedTo === null) {
        existingTask.assignedTo = null
      } else {
        existingTask.assignedTo = Number(data.assignedTo)
      }
    }

    if (normalizedAssigneeIds !== undefined) {
      existingTask.assigneeIds = normalizedAssigneeIds
      existingTask.assignedTo = normalizedAssigneeIds[0] ?? null
    } else if (data.assignedTo !== undefined) {
      existingTask.assigneeIds = existingTask.assignedTo ? [existingTask.assignedTo] : []
    }

    if (data.points !== undefined) {
      const points = Number(data.points)
      if (points < 0) throw new Error("Pontos não podem ser negativos")
      existingTask.points = points
    }
    if (data.dueDate !== undefined) existingTask.dueDate = data.dueDate ? String(data.dueDate) : null

    const updatedTask = await this.taskRepository.update(command.taskId, existingTask)

    if (normalizedAssigneeIds !== undefined) {
      await this.syncTaskAssignees(command.taskId, normalizedAssigneeIds, command.actorId)
    } else if (data.assignedTo !== undefined) {
      await this.syncTaskAssignees(
        command.taskId,
        updatedTask.assignedTo ? [updatedTask.assignedTo] : [],
        command.actorId,
      )
    }

    return await this.attachAssigneeIds(updatedTask)
  }

  async deleteTask(command: DeleteTaskCommand) {
    const task = await this.taskRepository.findById(command.taskId)
    if (!task) {
      throw new Error("Tarefa não encontrada")
    }

    await this.taskRepository.delete(command.taskId)
  }

  async completeTask(command: CompleteTaskCommand) {
    const task = await this.taskRepository.findById(command.taskId)
    if (!task) {
      throw new Error("Tarefa não encontrada")
    }

    if (task.completed) {
      throw new Error("Tarefa já concluída")
    }

    const user = await this.userRepository.findById(command.userId)
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    if (task.taskVisibility !== "public") {
      const canManageTasks = this.identityAccess.hasPermission(user.roles, "MANAGE_TASKS")
      const canManageUsers = this.identityAccess.hasPermission(user.roles, "MANAGE_USERS")
      const isAssigned = await this.isActorAssignedToTask(task, command.userId)
      if (!isAssigned && !canManageTasks && !canManageUsers) {
        throw new Error("Usuário não pode concluir tarefa atribuída a outro usuário")
      }
    }

    if (task.taskVisibility === "public" && this.taskUserProgressRepository.isAvailable()) {
      const existingProgress = await this.taskUserProgressRepository.findByTaskAndUser(task.id!, command.userId)
      if (existingProgress?.completedAt || existingProgress?.status === "done") {
        throw new Error("Tarefa pública já concluída por este usuário")
      }

      const now = new Date()
      const latePenalty = this.calculateLatePenalty(task, now)
      const pointsToAward = task.points - latePenalty

      await this.taskUserProgressRepository.upsertForTaskUser({
        taskId: task.id!,
        userId: command.userId,
        status: "done",
        pickedAt: existingProgress?.pickedAt ?? now,
        completedAt: now,
        awardedPoints: pointsToAward,
      })

      if (pointsToAward !== 0) {
        user.completedTasks += 1
        await this.userRepository.update(user)
      }

      await this.publishTaskCompletionAward(command.userId, command.taskId, pointsToAward)
      return this.withActorProgress(task, {
        status: "done",
        completedAt: now,
      }, command.userId)
    }

    if (task.projectId && this.identityAccess.hasAnyRole(user.roles, ["GERENTE_PROJETO"])) {
      const project = await this.projectRepository.findById(task.projectId)
      const leaderIsAssigned = await this.isActorAssignedToTask(task, command.userId)
      if (project && project.leaderId === command.userId && leaderIsAssigned) {
        throw new Error("Líderes de projeto não podem concluir suas próprias tasks. Delegue para outro membro da equipe.")
      }
    }

    const canBeCompleted = task.status !== "done" && (
      task.taskVisibility === "public" || task.assignedTo !== null
    )
    if (!canBeCompleted) {
      throw new Error("Tarefa não pode ser completada")
    }

    if (task.taskVisibility === "public" && !task.assignedTo) {
      task.assignedTo = command.userId
    }

    task.status = task.isGlobal || task.taskVisibility === "public" ? "done" : "in-review"
    task.completed = true
    if (task.status === "done") {
      task.completedAt = new Date()
    }
    const updatedTask = await this.taskRepository.update(command.taskId, task)
    const updatedTaskWithAssignees = await this.attachAssigneeIds(updatedTask)

    const latePenalty = this.calculateLatePenalty(task, new Date())
    const pointsToAward = task.points - latePenalty

    if (pointsToAward !== 0) {
      user.completedTasks += 1
      await this.userRepository.update(user)
    }

    await this.publishTaskCompletionAward(command.userId, command.taskId, pointsToAward)
    return updatedTaskWithAssignees
  }

  async approveTask(command: ApproveTaskCommand) {
    const task = await this.taskRepository.findById(command.taskId)
    if (!task) {
      throw new Error("Tarefa não encontrada")
    }

    if (task.status !== "in-review") {
      throw new Error("Tarefa não está em revisão")
    }

    const approver = await this.userRepository.findById(command.approverId)
    if (!approver) {
      throw new Error("Usuário aprovador não encontrado")
    }

    const canApproveAnyTask = this.identityAccess.hasPermission(approver.roles, "MANAGE_USERS")
    const canApproveProjectTask =
      this.identityAccess.hasAnyRole(approver.roles, ["GERENTE_PROJETO"])
      && task.projectId !== null
      && task.projectId !== undefined

    if (!canApproveAnyTask) {
      if (canApproveProjectTask) {
        const project = await this.projectRepository.findById(task.projectId!)
        if (!project || project.leaderId !== command.approverId) {
          throw new Error("Usuário não é líder do projeto")
        }
      } else {
        throw new Error("Usuário não tem permissão para aprovar esta tarefa")
      }
    }

    task.status = "done"
    task.completed = true
    task.completedAt = new Date()

    const updatedTask = await this.taskRepository.update(command.taskId, task)

    if (task.assignedTo) {
      const user = await this.userRepository.findById(task.assignedTo)
      if (user && task.points > 0) {
        const latePenalty = this.calculateLatePenalty(task, new Date())
        const pointsToAward = task.points - latePenalty

        user.completedTasks += 1
        await this.userRepository.update(user)
        await this.publishTaskCompletionAward(task.assignedTo, command.taskId, pointsToAward)
      }

      await this.publishTaskApproved(command.taskId, task.title, task.assignedTo)
    }

    return updatedTask
  }

  async rejectTask(command: RejectTaskCommand) {
    const task = await this.taskRepository.findById(command.taskId)
    if (!task) {
      throw new Error("Tarefa não encontrada")
    }

    if (task.status !== "in-review") {
      throw new Error("Tarefa não está em revisão")
    }

    const approver = await this.userRepository.findById(command.approverId)
    if (!approver) {
      throw new Error("Usuário aprovador não encontrado")
    }

    const canRejectAnyTask = this.identityAccess.hasPermission(approver.roles, "MANAGE_USERS")
    const canRejectProjectTask =
      this.identityAccess.hasAnyRole(approver.roles, ["GERENTE_PROJETO"])
      && task.projectId !== null
      && task.projectId !== undefined

    if (!canRejectAnyTask) {
      if (canRejectProjectTask) {
        const project = await this.projectRepository.findById(task.projectId!)
        if (!project || project.leaderId !== command.approverId) {
          throw new Error("Usuário não é líder do projeto")
        }
      } else {
        throw new Error("Usuário não tem permissão para rejeitar esta tarefa")
      }
    }

    task.status = "adjust"
    task.completed = false
    task.completedAt = null
    const updatedTask = await this.taskRepository.update(command.taskId, task)

    if (task.assignedTo) {
      await this.publishTaskRejected(command.taskId, task.title, task.assignedTo, command.reason)
    }

    return updatedTask
  }

  private async publishTaskReviewRequest(taskId: number, taskTitle: string, userId: number, projectLeaderId: number) {
    try {
      const user = await this.userRepository.findById(userId)
      const userName = user?.name || "Um usuário"
      await this.notificationsModule.publishEvent({
        eventType: "TASK_REVIEW_REQUEST",
        title: "Tarefa em Revisão",
        message: `${userName} marcou a tarefa "${taskTitle}" como "Em Revisão"`,
        data: { taskId, taskTitle, userId, userName },
        triggeredByUserId: userId,
        audience: { mode: "USER_IDS", userIds: [projectLeaderId] },
      })
    } catch (error) {
      console.error("Erro ao publicar notificação TASK_REVIEW_REQUEST:", error)
    }
  }

  private async publishTaskApproved(taskId: number, taskTitle: string, userId: number) {
    try {
      await this.notificationsModule.publishEvent({
        eventType: "TASK_APPROVED",
        title: "Tarefa Aprovada",
        message: `Sua tarefa "${taskTitle}" foi aprovada! Você recebeu os pontos.`,
        data: { taskId, taskTitle },
        audience: { mode: "USER_IDS", userIds: [userId] },
      })
    } catch (error) {
      console.error("Erro ao publicar notificação TASK_APPROVED:", error)
    }
  }

  private async publishTaskRejected(taskId: number, taskTitle: string, userId: number, reason?: string) {
    const message = reason
      ? `Sua tarefa "${taskTitle}" precisa de ajustes. Motivo: ${reason}`
      : `Sua tarefa "${taskTitle}" precisa de ajustes.`

    try {
      await this.notificationsModule.publishEvent({
        eventType: "TASK_REJECTED",
        title: "Tarefa Rejeitada",
        message,
        data: { taskId, taskTitle, reason },
        audience: { mode: "USER_IDS", userIds: [userId] },
      })
    } catch (error) {
      console.error("Erro ao publicar notificação TASK_REJECTED:", error)
    }
  }

  private calculateLatePenalty(task: Task, completionDate: Date): number {
    if (!task.dueDate) {
      return 0
    }

    const dueDate = new Date(task.dueDate)
    const timeDiff = completionDate.getTime() - dueDate.getTime()
    const daysLate = Math.ceil(timeDiff / (1000 * 60 * 60 * 24))

    if (daysLate <= 0) {
      return 0
    }

    return daysLate * task.points
  }

  private async publishTaskCompletionAward(userId: number, taskId: number, taskPoints: number) {
    try {
      await this.taskProgressEvents.onTaskCompleted({ userId, taskId, taskPoints })
    } catch (error) {
      console.error("Erro ao publicar progressão de gamificação para conclusão de task:", error)
    }
  }

  async applyActorProgress(tasks: Task[], actorId: number) {
    if (!this.taskUserProgressRepository.isAvailable()) {
    return await Promise.all(tasks.map((task) => this.attachAssigneeIds(task)))
    }

    const publicTasks = tasks.filter((task) => task.id && task.taskVisibility === "public")
    if (publicTasks.length === 0) {
      return await Promise.all(tasks.map((task) => this.attachAssigneeIds(task)))
    }

    const progressRows = await this.taskUserProgressRepository.findByTaskIdsAndUser(
      publicTasks.map((task) => task.id!),
      actorId,
    )

    const progressByTaskId = new Map(progressRows.map((row) => [row.taskId, row]))
    const withProgress = tasks.map((task) => {
      if (!task.id || task.taskVisibility !== "public") {
        return task
      }
      const progress = progressByTaskId.get(task.id)
      if (!progress) {
        return this.withActorProgress(task, {
          status: "to-do",
          completedAt: null,
        }, null)
      }

      return this.withActorProgress(task, {
        status: progress.status,
        completedAt: progress.completedAt,
      }, progress.userId)
    })
    return await Promise.all(withProgress.map((task) => this.attachAssigneeIds(task)))
  }

  private withActorProgress(
    task: Task,
    progress: { status: Task["status"]; completedAt: Date | null },
    actorId: number | null,
  ) {
    const cloned = new Task({
      ...task.toJSON(),
      status: progress.status,
      completed: progress.status === "done",
      completedAt: progress.completedAt,
      assignedTo: actorId,
    })
    return cloned
  }

  private normalizeAssigneeIds(data: Record<string, unknown>) {
    const raw = data.assigneeIds
    if (!Array.isArray(raw)) return []
    return Array.from(
      new Set(
        raw
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    )
  }

  private async ensureAssigneesExist(userIds: number[]) {
    for (const userId of userIds) {
      const assignee = await this.userRepository.findById(userId)
      if (!assignee) {
        throw new Error("Usuário não encontrado")
      }
    }
  }

  private async syncTaskAssignees(taskId: number, userIds: number[], actorId: number) {
    if (!this.taskAssigneeRepository.isAvailable()) {
      return
    }
    await this.taskAssigneeRepository.replaceAssignees(taskId, userIds, actorId)
  }

  private async attachAssigneeIds(task: Task) {
    if (!task.id || !this.taskAssigneeRepository.isAvailable()) {
      task.assigneeIds = task.assignedTo ? [task.assignedTo] : []
      return task
    }
    const assigneeIds = await this.taskAssigneeRepository.listUserIdsByTaskId(task.id)
    task.assigneeIds = assigneeIds
    task.assignedTo = assigneeIds[0] ?? task.assignedTo ?? null
    return task
  }

  private async isActorAssignedToTask(task: Task, actorId: number) {
    if (task.assignedTo === actorId) return true
    if (!task.id || !this.taskAssigneeRepository.isAvailable()) return false
    return await this.taskAssigneeRepository.isUserAssigned(task.id, actorId)
  }

  private async isActorAllowedToManipulateDelegatedTask(task: Task, actorId: number) {
    if (task.taskVisibility === "public") {
      return true
    }
    return await this.isActorAssignedToTask(task, actorId)
  }
}

export interface TaskManagementGatewayDependencies {
  taskRepository: TaskRepository
  taskAssigneeRepository: TaskAssigneeRepository
  taskUserProgressRepository: TaskUserProgressRepository
  userRepository: UserRepository
  projectRepository: ProjectRepository
  notificationsModule: NotificationsModule
  identityAccess: IdentityAccessModule
  taskProgressEvents: TaskProgressEvents
}

export function createTaskManagementGateway(
  dependencies: Partial<TaskManagementGatewayDependencies> = {},
) {
  if (!dependencies.notificationsModule || !dependencies.identityAccess || !dependencies.taskProgressEvents) {
    throw new Error("TaskManagementGateway requer notificationsModule, identityAccess e taskProgressEvents")
  }

  return new TaskServiceGateway(
    dependencies.taskRepository ?? new TaskRepository(),
    dependencies.taskAssigneeRepository ?? new TaskAssigneeRepository(),
    dependencies.taskUserProgressRepository ?? new TaskUserProgressRepository(),
    dependencies.userRepository ?? new UserRepository(),
    dependencies.projectRepository ?? new ProjectRepository(),
    dependencies.notificationsModule,
    dependencies.identityAccess,
    dependencies.taskProgressEvents,
  )
}

function dedupeTasksById<T extends { id?: number }>(tasks: T[]) {
  const seen = new Set<number>()
  return tasks.filter((task) => {
    if (!task.id) return true
    if (seen.has(task.id)) return false
    seen.add(task.id)
    return true
  })
}

function isPublicProgressOnlyUpdate(data: Record<string, unknown>) {
  const keys = Object.keys(data)
  if (keys.length === 0) return false
  return keys.every((key) => key === "status" || key === "assignedTo")
}

function isStatusOnlyUpdate(data: Record<string, unknown>) {
  const keys = Object.keys(data)
  if (keys.length === 0) return false
  return keys.every((key) => key === "status")
}
