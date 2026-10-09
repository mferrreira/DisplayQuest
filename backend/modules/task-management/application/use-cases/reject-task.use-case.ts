import {
  appendFixInstruction,
  approvalDecision,
  ConflictError,
  ForbiddenError,
  hasAnyRole,
  hasPermission,
  NotFoundError,
  systemActor,
  type Task,
} from "@/backend/domain";
import type { RejectTaskCommand } from "@/backend/modules/task-management/application/contracts";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import { attachAssignees } from "@/backend/modules/task-management/application/use-cases/internal/task-view";

/**
 * RejectTaskUseCase — OND4-B3 (R2): rules frozen by OND4-B1:
 *   - same authority gates as approve (MANAGE_USERS or the project's own leader; never self
 *     without MANAGE_USERS);
 *   - status -> "adjust", completed=false, completedAt=null;
 *   - a trimmed reason appends "FIX (dd/mm/yyyy): reason" (pt-BR date, America/Sao_Paulo)
 *     to the description; TASK_REJECTED notification.
 */
export interface RejectTaskDependencies {
  tasks: TaskRepositoryPort
  assignees: TaskAssigneesPort
  actors: TaskActorsPort
  projects: TaskProjectsPort
  notifications: TaskNotificationsPort
}

export class RejectTaskUseCase {
  constructor(private readonly dependencies: RejectTaskDependencies) {}

  async execute(command: RejectTaskCommand): Promise<Task> {
    const task = await this.dependencies.tasks.findById(command.taskId)
    if (!task) {
      throw new NotFoundError("Tarefa não encontrada")
    }

    if (task.status !== "in-review") {
      throw new ConflictError("Tarefa não está em revisão")
    }

    const approver = await this.dependencies.actors.findById(command.approverId)
    if (!approver) {
      throw new NotFoundError("Usuário aprovador não encontrado")
    }

    const taskWithAssignees = await attachAssignees(task, this.dependencies.assignees)
    const isSelf =
      taskWithAssignees.assignedTo === command.approverId
      || Boolean(taskWithAssignees.assigneeIds?.includes(command.approverId))

    const decision = approvalDecision({
      canApproveAny: hasPermission(approver.roles, "MANAGE_USERS"),
      isSelf,
      canApproveProjectTask:
        hasAnyRole(approver.roles, ["GERENTE_PROJETO"]) && task.projectId !== null && task.projectId !== undefined,
    })

    if (decision.allowed === false) {
      if (decision.reason === "self") {
        throw new ForbiddenError("Líder não pode rejeitar a própria tarefa. Solicite um gerente ou coordenador.")
      }
      throw new ForbiddenError("Usuário não tem permissão para rejeitar esta tarefa")
    }

    if (decision.allowed === "needs-leader-check") {
      const project = await this.dependencies.projects.findById(task.projectId!)
      if (!project || project.leaderId !== command.approverId) {
        throw new ForbiddenError("Usuário não é líder do projeto")
      }
    }

    const normalizedReason = command.reason?.trim()

    const next = {
      ...taskWithAssignees,
      status: "adjust" as const,
      completed: false,
      completedAt: null,
    }
    if (normalizedReason) {
      next.description = appendFixInstruction(task.description, normalizedReason, todayLabel())
    }

    const updatedTask = await this.dependencies.tasks.update(command.taskId, next)

    if (taskWithAssignees.assignedTo) {
      await this.publishTaskRejected(
        command.taskId,
        task.title,
        taskWithAssignees.assignedTo,
        normalizedReason,
      )
    }

    return updatedTask
  }

  private async publishTaskRejected(taskId: number, taskTitle: string, userId: number, reason?: string) {
    const message = reason
      ? `Sua tarefa "${taskTitle}" precisa de ajustes. Motivo: ${reason}`
      : `Sua tarefa "${taskTitle}" precisa de ajustes.`

    try {
      await this.dependencies.notifications.publishEvent({
        eventType: "TASK_REJECTED",
        title: "Tarefa Rejeitada",
        message,
        data: { taskId, taskTitle, reason },
        audience: { mode: "USER_IDS", userIds: [userId] },
        actor: systemActor("SYSTEM_EVENT"),
      })
    } catch (error) {
      console.error("Erro ao publicar notificação TASK_REJECTED:", error)
    }
  }
}

/** pt-BR day label in America/Sao_Paulo (frozen from the legacy appendFixInstruction). */
function todayLabel(): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date())
}
