import {
  approvalDecision,
  assertSubtasksAllowTransition,
  hasAnyRole,
  hasPermission,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  openSubtasksCount,
  supportsSubtasks,
  systemActor,
  totalAwardForCompletion,
  type Task,
} from "@/backend/domain";
import type { ApproveTaskCommand, TaskCompletionResult } from "@/backend/modules/task-management/application/contracts";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port";
import type { TaskProgressEvents } from "@/backend/modules/task-management/application/ports/task-progress.events";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import {
  attachAssignees,
  awardableSubtasks,
  publishTaskCompletionAward,
} from "@/backend/modules/task-management/application/use-cases/internal/task-view";

/**
 * ApproveTaskUseCase — OND4-B3 (R2): rules frozen by OND4-B1:
 *   - only "in-review" tasks; approver must exist;
 *   - isSelf is evaluated AFTER attachAssignees rewrites assignedTo to assignees[0];
 *   - authority: MANAGE_USERS, or GERENTE_PROJETO who leads the task's project;
 *   - self-approval is forbidden without MANAGE_USERS (even for the project leader);
 *   - the update persists the ATTACHED view (assignedTo may become assignees[0]);
 *   - non-public/non-global approval increments the assignee's completedTasks; the award fires
 *     unconditionally (plan-v3 DEC-30: every task is worth POINTS_PER_TASK, so the old
 *     `points > 0` gate would silently keep legacy 0-point tasks worth nothing);
 *     TASK_APPROVED notification.
 *
 * plan-v3 OND4-A: devolve `TaskCompletionResult`. `awardedTo` é o **responsável** da tarefa,
 * nunca o aprovador — autoaprovação é proibida sem MANAGE_USERS. Por isso o contrato carrega
 * quem foi creditado: sem ele, o cliente animaria o contador de quem aprovou com o prêmio de
 * outra pessoa (medido no e2e: o fixture entrega ao próprio aprovador justamente porque
 * `MANAGE_USERS` abre essa porta, e é por isso que o teste enxerga o contador mudar).
 */
export interface ApproveTaskDependencies {
  tasks: TaskRepositoryPort
  assignees: TaskAssigneesPort
  actors: TaskActorsPort
  projects: TaskProjectsPort
  notifications: TaskNotificationsPort
  subtasks: TaskSubtasksPort
}

export class ApproveTaskUseCase {
  constructor(
    private readonly dependencies: ApproveTaskDependencies,
    private readonly events?: TaskProgressEvents,
  ) {}

  async execute(command: ApproveTaskCommand): Promise<TaskCompletionResult> {
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
        throw new ForbiddenError("Líder não pode aprovar a própria tarefa. Solicite um gerente ou coordenador.")
      }
      throw new ForbiddenError("Usuário não tem permissão para aprovar esta tarefa")
    }

    if (decision.allowed === "needs-leader-check") {
      const project = await this.dependencies.projects.findById(task.projectId!)
      if (!project || project.leaderId !== command.approverId) {
        throw new ForbiddenError("Usuário não é líder do projeto")
      }
    }

    // plan-v4 · V4-4 (DEC-57 + resposta do dono): aprovar também recusa com subtask aberta — a
    // regra é "nada termina com subtask aberta", nos três caminhos. A autoridade foi checada
    // antes de propósito: quem não pode aprovar não descobre que a tarefa tem subtask pendente.
    const subtaskRows = supportsSubtasks(task.taskVisibility, Boolean(task.isGlobal))
      ? await this.dependencies.subtasks.listByTaskId(command.taskId)
      : []
    assertSubtasksAllowTransition("done", openSubtasksCount(subtaskRows), "approve")

    const updatedTask = await this.dependencies.tasks.update(command.taskId, {
      ...taskWithAssignees,
      status: "done",
      completed: true,
      completedAt: new Date(),
    })

    let awardedTo: number | null = null
    let awardedPoints: number | null = null

    if (taskWithAssignees.assignedTo) {
      const assignedUser = await this.dependencies.actors.findById(taskWithAssignees.assignedTo)
      if (assignedUser) {
        // For delegated tasks completeTask did not award (status was "in-review"); the
        // counter increments here, even when the task carries no points.
        if (task.taskVisibility !== "public" && !task.isGlobal) {
          await this.dependencies.actors.incrementCompletedTasks(taskWithAssignees.assignedTo)
        }
        const pointsToAward = totalAwardForCompletion(task, awardableSubtasks(task, subtaskRows), new Date())
        // plan-v3 OND4-A: o creditado, não o pedido. `awardedTo` é quem recebeu.
        awardedPoints = await publishTaskCompletionAward(
          this.events,
          taskWithAssignees.assignedTo,
          command.taskId,
          pointsToAward,
        )
        awardedTo = taskWithAssignees.assignedTo
      }

      await this.publishTaskApproved(command.taskId, task.title, taskWithAssignees.assignedTo)
    }

    return { task: updatedTask, awardedTo, awardedPoints }
  }

  private async publishTaskApproved(taskId: number, taskTitle: string, userId: number) {
    try {
      await this.dependencies.notifications.publishEvent({
        eventType: "TASK_APPROVED",
        title: "Tarefa Aprovada",
        message: `Sua tarefa "${taskTitle}" foi aprovada! Você recebeu os pontos.`,
        data: { taskId, taskTitle },
        audience: { mode: "USER_IDS", userIds: [userId] },
        actor: systemActor("SYSTEM_EVENT"),
      })
    } catch (error) {
      console.error("Erro ao publicar notificação TASK_APPROVED:", error)
    }
  }
}
