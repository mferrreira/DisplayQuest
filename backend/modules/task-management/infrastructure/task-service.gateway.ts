import { Task } from "@/backend/models/Task"
import { TaskRepository } from "@/backend/repositories/TaskRepository"
import { UserRepository } from "@/backend/repositories/UserRepository"
import { ProjectRepository } from "@/backend/repositories/ProjectRepository"
import { createNotificationsModule, type NotificationsModule } from "@/backend/modules/notifications"
import { createIdentityAccessModule, type IdentityAccessModule } from "@/backend/modules/identity-access"
import { createTaskProgressEvents } from "@/backend/modules/task-management/infrastructure/gamification-task-progress.events"
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
    private readonly userRepository: UserRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly notificationsModule: NotificationsModule,
    private readonly identityAccess: IdentityAccessModule,
    private readonly taskProgressEvents: TaskProgressEvents,
  ) {}

  async getTaskById(taskId: number) {
    return await this.taskRepository.findById(taskId)
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

    return await this.taskRepository.findByAssigneeId(actorId)
  }

  async listGlobalTasks() {
    const tasks = await this.taskRepository.findAll()
    return tasks.filter((task) => task.isGlobal || task.taskVisibility === "public")
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

    if (data.isGlobal) {
      if (!this.identityAccess.hasPermission(creator.roles, "MANAGE_USERS")) {
        throw new Error("Usuário não tem permissão para criar quests globais")
      }
      data.assignedTo = null
      data.projectId = null
      data.taskVisibility = "public"
    } else {
      if (data.projectId) {
        const project = await this.projectRepository.findById(data.projectId)
        if (!project) {
          throw new Error("Projeto não encontrado")
        }
      }

      if (data.assignedTo) {
        const assignee = await this.userRepository.findById(data.assignedTo)
        if (!assignee) {
          throw new Error("Usuário não encontrado")
        }
      }
    }

    const task = Task.create(data)
    return await this.taskRepository.create(task)
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

    if (data.assignedTo !== undefined && data.assignedTo !== null) {
      const assignee = await this.userRepository.findById(Number(data.assignedTo))
      if (!assignee) {
        throw new Error("Usuário não encontrado")
      }
    }

    if (data.title !== undefined) existingTask.title = String(data.title)
    if (data.description !== undefined) existingTask.description = String(data.description || "")
    if (data.priority !== undefined) existingTask.priority = data.priority as any

    if (data.status !== undefined) {
      const oldStatus = existingTask.status
      existingTask.status = data.status as any
      existingTask.completed = data.status === "done"

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

    if (data.points !== undefined) {
      const points = Number(data.points)
      if (points < 0) throw new Error("Pontos não podem ser negativos")
      existingTask.points = points
    }
    if (data.dueDate !== undefined) existingTask.dueDate = data.dueDate ? String(data.dueDate) : null

    return await this.taskRepository.update(command.taskId, existingTask)
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

    if (task.projectId && this.identityAccess.hasAnyRole(user.roles, ["GERENTE_PROJETO"])) {
      const project = await this.projectRepository.findById(task.projectId)
      if (project && project.leaderId === command.userId && task.assignedTo === command.userId) {
        throw new Error("Líderes de projeto não podem concluir suas próprias tasks. Delegue para outro membro da equipe.")
      }
    }

    const canBeCompleted = task.status !== "done" && (
      task.taskVisibility === "public" || task.assignedTo !== null
    )
    if (!canBeCompleted) {
      throw new Error("Tarefa não pode ser completada")
    }
    task.status = task.isGlobal || task.taskVisibility === "public" ? "done" : "in-review"
    task.completed = true
    const updatedTask = await this.taskRepository.update(command.taskId, task)

    const latePenalty = this.calculateLatePenalty(task, new Date())
    const pointsToAward = task.points - latePenalty

    if (pointsToAward !== 0) {
      user.completedTasks += 1
      await this.userRepository.update(user)
    }

    await this.publishTaskCompletionAward(command.userId, command.taskId, pointsToAward)
    return updatedTask
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
}

export function createTaskManagementGateway() {
  return new TaskServiceGateway(
    new TaskRepository(),
    new UserRepository(),
    new ProjectRepository(),
    createNotificationsModule(),
    createIdentityAccessModule(),
    createTaskProgressEvents(),
  )
}
