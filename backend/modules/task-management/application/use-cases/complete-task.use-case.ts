import {
  assertSubtasksAllowTransition,
  awardPointsForCompletion,
  canBeCompleted,
  ConflictError,
  ForbiddenError,
  hasAnyRole,
  hasPermission,
  isCompletePermissionDenied,
  isLeaderSelfCompleteDenied,
  isProgressAlreadyCompleted,
  NotFoundError,
  openSubtasksCount,
  progressPatchForCompletion,
  requireActorSelfOrPermission,
  supportsSubtasks,
  totalAwardForCompletion,
  withActorProgress,
  type Task,
} from "@/backend/domain";
import type { CompleteTaskCommand, TaskCompletionResult } from "@/backend/modules/task-management/application/contracts";
import { requireTaskPersonActor } from "@/backend/modules/task-management/application/use-cases/internal/require-task-actor";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskProgressEvents } from "@/backend/modules/task-management/application/ports/task-progress.events";
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import {
  attachAssignees,
  awardableSubtasks,
  claimTaskIfUnclaimed,
  isActorAssignedToTask,
  publishTaskCompletionAward,
} from "@/backend/modules/task-management/application/use-cases/internal/task-view";

/**
 * CompleteTaskUseCase — OND4-B3 (R2): rules frozen by OND4-B1:
 *   - delegated tasks land in "in-review" (completed=true, completedAt NOT set; the counter
 *     and the award live in approveTask);
 *   - public/global land "done": with task_user_progress available the completion is
 *     PER-USER (row untouched, counter++, award = points - latePenalty); without the table
 *     the row itself is closed and assignedTo becomes the completer;
 *   - GERENTE_PROJETO who leads the project AND is assigned cannot self-complete;
 *   - D-41: completing an unclaimed task claims it; a dirty row (assignees exist but
 *     assignedTo null) is materialized to assignees[0].
 *
 * plan-v3 OND4-A: devolve `TaskCompletionResult` — a tarefa e o prêmio creditado. Só os dois
 * caminhos que publicam award trazem `awardedTo`/`awardedPoints`; a tarefa delegada que vai
 * para "in-review" não credita ninguém agora (o prêmio fica com a aprovação), e devolve `null`
 * nos dois campos em vez de um 0 que pareceria "valeu zero pontos".
 */
export interface CompleteTaskDependencies {
  tasks: TaskRepositoryPort
  assignees: TaskAssigneesPort
  progress: TaskProgressPort
  actors: TaskActorsPort
  projects: TaskProjectsPort
  subtasks: TaskSubtasksPort
}

export class CompleteTaskUseCase {
  constructor(
    private readonly dependencies: CompleteTaskDependencies,
    private readonly events?: TaskProgressEvents,
  ) {}

  async execute(command: CompleteTaskCommand): Promise<TaskCompletionResult> {
    // B6-7 (D4): o gate cross-actor da rota desceu para ca, ANTES do lookup (ordem medida):
    // creditar a OUTRO usuario exige MANAGE_TASKS ("Sem permissão para concluir tarefa para
    // outro usuario"); o default do premiado e o proprio ator (medido).
    const person = requireTaskPersonActor(command.actor)
    const userId = command.userId ?? person.id
    requireActorSelfOrPermission(person, userId, "MANAGE_TASKS", "Sem permissão para concluir tarefa para outro usuário")

    const task = await this.dependencies.tasks.findById(command.taskId)
    if (!task) {
      throw new NotFoundError("Tarefa não encontrada")
    }

    if (task.completed) {
      throw new ConflictError("Tarefa já concluída")
    }

    const user = await this.dependencies.actors.findById(userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const canManageTasks = hasPermission(user.roles, "MANAGE_TASKS")
    const canManageUsers = hasPermission(user.roles, "MANAGE_USERS")

    if (task.taskVisibility !== "public") {
      const isAssigned = await isActorAssignedToTask(task, userId, this.dependencies.assignees)
      if (isCompletePermissionDenied(task.taskVisibility, isAssigned, canManageTasks, canManageUsers)) {
        throw new ForbiddenError("Usuário não pode concluir tarefa atribuída a outro usuário")
      }
    }

    // Public + progress table: per-user completion, the task row is NOT touched.
    if (task.taskVisibility === "public" && this.dependencies.progress.isAvailable()) {
      const existingProgress = await this.dependencies.progress.findByTaskAndUser(task.id!, userId)
      if (isProgressAlreadyCompleted(existingProgress)) {
        throw new ConflictError("Tarefa pública já concluída por este usuário")
      }

      const now = new Date()
      const pointsToAward = awardPointsForCompletion(task, now)

      await this.dependencies.progress.upsert({
        taskId: task.id!,
        userId: userId,
        ...progressPatchForCompletion(existingProgress, now, pointsToAward),
      })

      // completedTasks counts the individual completion itself, not the points: a 0-point
      // completion still counts.
      await this.dependencies.actors.incrementCompletedTasks(userId)

      const creditedPoints = await publishTaskCompletionAward(
        this.events,
        userId,
        command.taskId,
        pointsToAward,
      )

      return {
        task: withActorProgress(task, { status: "done", completedAt: now }, userId),
        awardedTo: userId,
        awardedPoints: creditedPoints,
      }
    }

    if (task.projectId && hasAnyRole(user.roles, ["GERENTE_PROJETO"])) {
      const project = await this.dependencies.projects.findById(task.projectId)
      const leaderIsAssigned = await isActorAssignedToTask(task, userId, this.dependencies.assignees)
      if (
        isLeaderSelfCompleteDenied(
          hasAnyRole(user.roles, ["GERENTE_PROJETO"]),
          Boolean(project && project.leaderId === userId),
          leaderIsAssigned,
        )
      ) {
        throw new ForbiddenError(
          "Líderes de projeto não podem concluir suas próprias tasks. Delegue para outro membro da equipe.",
        )
      }
    }

    let workingTask = task

    // D-41: completing an unclaimed task assigns the completer (never reassigns). If the
    // row is dirty (owner only in task_assignees), materialize the real owner.
    if (task.taskVisibility !== "public" && !task.isGlobal && task.assignedTo == null) {
      const { claimed, task: claimedTask } = await claimTaskIfUnclaimed(
        workingTask,
        userId,
        this.dependencies.assignees,
      )
      workingTask = claimedTask
      if (!claimed && task.id != null && this.dependencies.assignees.isAvailable()) {
        const assignedUserIds = await this.dependencies.assignees.listUserIdsByTaskId(task.id)
        if (assignedUserIds.length > 0) {
          workingTask = { ...workingTask, assignedTo: assignedUserIds[0], assigneeIds: assignedUserIds }
        }
      }
    }

    if (!canBeCompleted(workingTask)) {
      throw new ConflictError("Tarefa não pode ser completada")
    }

    if (workingTask.taskVisibility === "public" && !workingTask.assignedTo) {
      workingTask = { ...workingTask, assignedTo: userId }
    }

    const finalStatus = workingTask.isGlobal || workingTask.taskVisibility === "public" ? "done" : "in-review"

    // plan-v4 · V4-4 (DEC-57): a mãe não vai para revisão nem é concluída com subtask aberta.
    // As linhas lidas aqui servem duas coisas: contar as abertas e compor o prêmio (DEC-78).
    const subtaskRows = supportsSubtasks(workingTask.taskVisibility, Boolean(workingTask.isGlobal))
      ? await this.dependencies.subtasks.listByTaskId(command.taskId)
      : []
    assertSubtasksAllowTransition(finalStatus, openSubtasksCount(subtaskRows))

    workingTask = { ...workingTask, status: finalStatus, completed: true }
    if (finalStatus === "done") {
      workingTask.completedAt = new Date()
    }

    const updatedTask = await this.dependencies.tasks.update(command.taskId, workingTask)
    const updatedTaskWithAssignees = await attachAssignees(updatedTask, this.dependencies.assignees)

    // completedTasks counts reaching "done" itself, even with 0 points. Delegated/project
    // tasks never land here (they go to "in-review"); their counter lives in approveTask.
    let awardedPoints: number | null = null
    if (finalStatus === "done") {
      await this.dependencies.actors.incrementCompletedTasks(userId)
      const pointsToAward = totalAwardForCompletion(workingTask, awardableSubtasks(workingTask, subtaskRows), new Date())
      awardedPoints = await publishTaskCompletionAward(
        this.events,
        userId,
        command.taskId,
        pointsToAward,
      )
    }

    return {
      task: updatedTaskWithAssignees,
      // delegated lands "in-review" without awarding (approveTask credits): null, not 0 —
      // "ninguém creditado agora" e "valeu zero pontos" são coisas diferentes na interface.
      awardedTo: finalStatus === "done" ? userId : null,
      awardedPoints,
    }
  }
}
