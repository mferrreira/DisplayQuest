import {
  applyAssigneeIds,
  ForbiddenError,
  hasPermission,
  isClaimable,
  subtaskBasePoints,
  toTaskView,
  withActorProgress,
  systemActor,
  type AwardableSubtask,
  type ISubtask,
  type Task,
  type TaskStatus,
} from "@/backend/domain";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository";
import type { TaskProgressEvents } from "@/backend/modules/task-management/application/ports/task-progress.events";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";

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

// ---------------------------------------------------------------------------
// plan-v4 · V4-4 — subtasks: read model, autoridade, janela e sincronização da base
// ---------------------------------------------------------------------------

/** Read model: as subtasks da mãe vão no JSON da tarefa (DEC-79). */
export async function attachSubtasks(task: Task, subtasks: TaskSubtasksPort): Promise<Task> {
  if (!task.id) return task;
  return toTaskView({ ...task, subtasks: await subtasks.listByTaskId(task.id) });
}

/**
 * DEC-78 — a única tradução entre a linha lida da tabela e o que a regra de pontuação lê.
 * A subtask não tem prazo próprio: o prazo usado é o **da mãe**, e o instante é o da própria
 * subtask. Existe um lugar só porque `completeTask` e `approveTask` creditam, e a lição medida
 * de 2026-10-05 é que a mesma conta em dois lugares diverge.
 */
export function awardableSubtasks(
  mother: Pick<Task, "dueDate">,
  subtasks: ReadonlyArray<ISubtask>,
): AwardableSubtask[] {
  return subtasks.map((subtask) => ({
    dueDate: mother.dueDate ?? null,
    completed: subtask.completed,
    completedAt: subtask.completedAt ?? null,
  }));
}

/** Variante em lote — a lista do quadro tem uma consulta só, não N+1. */
export async function batchAttachSubtasks(tasks: Task[], subtasks: TaskSubtasksPort): Promise<Task[]> {
  const taskIds = tasks.filter((task) => task.id).map((task) => task.id!);
  if (taskIds.length === 0) return tasks;
  const grouped = await subtasks.listByTaskIds(taskIds);
  return tasks.map((task) => (task.id ? toTaskView({ ...task, subtasks: grouped.get(task.id) ?? [] }) : task));
}

export interface SubtaskAuthorityDeps {
  assignees: TaskAssigneesPort;
  actors: TaskActorsPort;
  projects: TaskProjectsPort;
}

/**
 * "A mesma autoridade de editar a mãe" (resposta do dono, DEC-82), traduzida para as portas
 * deste módulo.
 * A mãe é editada hoje por três portas no `UpdateTaskUseCase`, e a união delas é esta:
 *   - quem tem MANAGE_TASKS ou MANAGE_USERS;
 *   - quem está atribuído à tarefa (coluna `assignedTo` ou `task_assignees`);
 *   - quem criou ou lidera o projeto da tarefa;
 *   - quem é membro do projeto da tarefa.
 * Sem projeto, sem atribuição e sem gestão: barrado.
 */
export async function assertCanOperateSubtasks(
  task: Task,
  actorId: number,
  actorRoles: string[],
  deps: SubtaskAuthorityDeps,
): Promise<void> {
  const denied = new ForbiddenError("Usuário não pode gerenciar as subtasks desta tarefa");
  if (hasPermission(actorRoles, "MANAGE_TASKS") || hasPermission(actorRoles, "MANAGE_USERS")) return;
  if (await isActorAssignedToTask(task, actorId, deps.assignees)) return;
  if (!task.projectId) throw denied;

  const project = await deps.projects.findById(task.projectId);
  if (project && (project.createdBy === actorId || project.leaderId === actorId)) return;

  const memberships = await deps.actors.getUserProjectMemberships(actorId);
  if (memberships.some((membership) => membership.projectId === task.projectId)) return;
  throw denied;
}

/**
 * A base gravada em `tasks.points` é 10 + 10·n (resposta do dono). Ela é sincronizada quando a
 * LISTA muda — criar e apagar — e não quando uma subtask é concluída: a base conta subtasks,
 * não concluídas.
 *
 * `tasks.update` é substituição completa (congelado desde OND4-B3), então a sincronização escreve
 * a linha inteira a partir da view que o caso de uso já tem em mãos — o mesmo que `updateTask`
 * faz em todos os caminhos.
 */
export async function syncMotherBasePoints(
  task: Task,
  subtaskCount: number,
  tasks: TaskRepositoryPort,
): Promise<Task> {
  const base = subtaskBasePoints(subtaskCount);
  if (task.points === base) return task;
  return await tasks.update(task.id!, { ...task, points: base });
}

// `subtaskWindowMessage` (a frase da janela, DEC-80) foi movida para
// `backend/domain/task/subtask-rules.ts` no V4-5: passou a ter chamadores fora do módulo — os
// três use cases de subtask e o mock de teste (`tests/mocks/handlers.ts`), que precisa dizer
// exatamente a mesma frase que a rota real diz. Deixá-la aqui significava a regra em duas cópias.

/**
 * TASK_REVIEW_REQUEST — movido para cá no V4-4 porque passou a ter dois chamadores: o
 * `UpdateTaskUseCase` (pessoa moveu a mãe) e o auto-move da última subtask. A lição medida de
 * 2026-10-05 no `tests/e2e/shell.spec.ts` é esta: a mesma regra em duas cópias diverge.
 *
 * Publicação nunca quebra a ação (congelado): o erro é registrado e engolido.
 */
export async function publishTaskReviewRequest(
  notifications: TaskNotificationsPort,
  actors: TaskActorsPort,
  input: { taskId: number; taskTitle: string; userId: number; projectLeaderId: number },
): Promise<void> {
  try {
    const user = await actors.findById(input.userId);
    const userName = user?.name || "Um usuário";
    await notifications.publishEvent({
      eventType: "TASK_REVIEW_REQUEST",
      title: "Tarefa em Revisão",
      message: `${userName} marcou a tarefa "${input.taskTitle}" como "Em Revisão"`,
      data: { taskId: input.taskId, taskTitle: input.taskTitle, userId: input.userId, userName },
      triggeredByUserId: input.userId,
      audience: { mode: "USER_IDS", userIds: [input.projectLeaderId] },
      actor: systemActor("SYSTEM_EVENT"),
    });
  } catch (error) {
    console.error("Erro ao publicar notificação TASK_REVIEW_REQUEST:", error);
  }
}
