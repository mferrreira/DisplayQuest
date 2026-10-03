import {
  applyAssigneeIds,
  isClaimable,
  toTaskView,
  withActorProgress,
  type Task,
} from "@/backend/domain";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository";
import type { TaskProgressEvents } from "@/backend/modules/task-management/application/ports/task-progress.events";

/**
 * OND4-B3 — shared view/compat helpers for the task use cases. Semantics frozen by the
 * OND4-B1 golden matrix (attachAssigneeIds / batchAttachAssigneeIds / claimTaskIfUnclaimed
 * / withActorProgress in task-service.gateway.ts).
 */

/** Attach task_assignees to one task view (fallback [assignedTo] only when the table is absent). */
export async function attachAssignees(task: Task, assignees: TaskAssigneesPort): Promise<Task> {
  if (!task.id || !assignees.isAvailable()) {
    return toTaskView({ ...task, ...applyAssigneeIds(task, null) });
  }
  const assigneeIds = await assignees.listUserIdsByTaskId(task.id);
  return toTaskView({ ...task, ...applyAssigneeIds(task, assigneeIds) });
}

/** Batch variant: when the table is available and no task has an id, NOTHING is rewritten. */
export async function batchAttachAssignees(tasks: Task[], assignees: TaskAssigneesPort): Promise<Task[]> {
  if (!assignees.isAvailable()) {
    return tasks.map((task) => toTaskView({ ...task, ...applyAssigneeIds(task, null) }));
  }
  const taskIds = tasks.filter((task) => task.id).map((task) => task.id!);
  if (taskIds.length === 0) return tasks;
  const assigneeMap = await assignees.listUserIdsByTaskIds(taskIds);
  return tasks.map((task) => {
    if (!task.id) return task;
    return toTaskView({ ...task, ...applyAssigneeIds(task, assigneeMap.get(task.id) ?? []) });
  });
}

export async function isActorAssignedToTask(
  task: Task,
  actorId: number,
  assignees: TaskAssigneesPort,
): Promise<boolean> {
  if (task.assignedTo === actorId) return true;
  if (!task.id || !assignees.isAvailable()) return false;
  return await assignees.isUserAssigned(task.id, actorId);
}

/** syncTaskAssignees: no-op when the table is absent. */
export async function syncAssignees(
  taskId: number,
  userIds: number[],
  actorId: number,
  assignees: TaskAssigneesPort,
): Promise<void> {
  if (!assignees.isAvailable()) return;
  await assignees.replaceAssignees(taskId, userIds, actorId);
}

/**
 * D-41 claim: assigns the actor as owner ONLY when the task has no owner at all
 * (assignedTo column empty AND no task_assignees rows). Never reassigns.
 */
export async function claimTaskIfUnclaimed(
  task: Task,
  actorId: number,
  assignees: TaskAssigneesPort,
): Promise<{ claimed: boolean; task: Task }> {
  if (!isClaimable(task)) return { claimed: false, task };
  if (task.id != null && assignees.isAvailable()) {
    const assignedUserIds = await assignees.listUserIdsByTaskId(task.id);
    if (assignedUserIds.length > 0) return { claimed: false, task };
  }
  const claimedTask = toTaskView({ ...task, assignedTo: actorId, assigneeIds: [actorId] });
  if (task.id != null) {
    await syncAssignees(task.id, [actorId], actorId, assignees);
  }
  return { claimed: true, task: claimedTask };
}

/** applyActorProgress: per-user progress overlay for PUBLIC tasks + batch assignee attach. */
export async function applyActorProgressToTasks(
  tasks: Task[],
  actorId: number,
  deps: { assignees: TaskAssigneesPort; progress: TaskProgressPort },
): Promise<Task[]> {
  if (!deps.progress.isAvailable()) {
    return await batchAttachAssignees(tasks, deps.assignees);
  }

  const publicTasks = tasks.filter((task) => task.id && task.taskVisibility === "public");
  if (publicTasks.length === 0) {
    return await batchAttachAssignees(tasks, deps.assignees);
  }

  const progressRows = await deps.progress.findByTaskIdsAndUser(
    publicTasks.map((task) => task.id!),
    actorId,
  );
  const progressByTaskId = new Map(progressRows.map((row) => [row.taskId, row]));

  const withProgress = tasks.map((task) => {
    if (!task.id || task.taskVisibility !== "public") return task;
    const progress = progressByTaskId.get(task.id);
    if (!progress) {
      return withActorProgress(task, { status: "to-do", completedAt: null }, null);
    }
    return withActorProgress(task, { status: progress.status, completedAt: progress.completedAt }, progress.userId);
  });

  return await batchAttachAssignees(withProgress, deps.assignees);
}

/**
 * publishTaskCompletionAward: award failures never break the completion (frozen).
 *
 * plan-v3 OND4-A: devolve os pontos **efetivamente creditados** (ou `null`), para o caso de uso
 * levar o número até a resposta HTTP. Antes devolvia nada e a rota não tinha como saber o que
 * foi creditado — o comentário da rota de conclusão registrava isso como limitação aceita.
 */
export async function publishTaskCompletionAward(
  events: TaskProgressEvents | undefined,
  userId: number,
  taskId: number,
  taskPoints: number,
): Promise<number | null> {
  if (!events) return null;
  try {
    return await events.onTaskCompleted({ userId, taskId, taskPoints });
  } catch (error) {
    console.error("Erro ao publicar progressão de gamificação para conclusão de task:", error);
    return null;
  }
}
