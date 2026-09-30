/**
 * OND4-B2 — pure task domain (SPEC §4.5, DEC-20 pattern).
 *
 * Like `domain/work/session-rules.ts`, the "rich Task" is implemented as PURE FUNCTIONS
 * over the `Task` data interface (domain/task/Task.ts), NOT a class: the contract parity
 * (R3) requires preserving the frozen quirks the golden matrix pinned (OND4-B1), and pure
 * functions keep each quirk explicit and individually testable.
 *
 * Everything here is deterministic: no Prisma, no clocks, no singletons. `now`/`todayLabel`
 * are parameters; the use cases (OND4-B3) inject them.
 */
import { hasAnyRole, hasPermission } from "../identity";
import { ValidationError } from "../errors";
import type { ITask, Task } from "./Task";
import type { TaskStatus } from "./TaskStatus";
import type { TaskVisibility } from "./TaskVisibility";

// ---------------------------------------------------------------------------
// Payload classification (frozen from task-service.gateway.ts:918-928)
// ---------------------------------------------------------------------------

/** Keys are a non-empty subset of {status, assignedTo} — public progress-only update. */
export function isPublicProgressOnlyUpdate(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  if (keys.length === 0) return false;
  return keys.every((key) => key === "status" || key === "assignedTo");
}

/** Keys are a non-empty subset of {status} — status-only update. */
export function isStatusOnlyUpdate(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  if (keys.length === 0) return false;
  return keys.every((key) => key === "status");
}

/** assigneeIds -> deduped integers > 0 (non-array yields []). */
export function normalizeAssigneeIds(data: Record<string, unknown>): number[] {
  const raw = data.assigneeIds;
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
}

/** Keep first occurrence per id; rows without id always pass. */
export function dedupeTasksById<T extends { id?: number }>(tasks: T[]): T[] {
  const seen = new Set<number>();
  return tasks.filter((task) => {
    if (!task.id) return true;
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Status transitions (frozen: the two branches differ on completedAt)
// ---------------------------------------------------------------------------

export type StatusPatch = {
  status: TaskStatus;
  completed: boolean;
  /** undefined means "leave the existing completedAt untouched". */
  completedAt: Date | null | undefined;
};

/**
 * Status-only branch (gateway :268-276): completedAt is ALWAYS rewritten —
 * `done` ? now : null (even when the task was already done).
 */
export function statusOnlyPatch(nextStatus: TaskStatus, now: Date): StatusPatch {
  return {
    status: nextStatus,
    completed: nextStatus === "done",
    completedAt: nextStatus === "done" ? now : null,
  };
}

/**
 * Fall-through branch (gateway :338-348): completedAt is set ONLY on the transition
 * INTO done (old !== done) and cleared only on the transition OUT of done; staying in
 * done keeps the original timestamp.
 */
export function fallThroughStatusPatch(
  oldStatus: TaskStatus,
  nextStatus: TaskStatus,
  now: Date,
): StatusPatch {
  const isDone = nextStatus === "done";
  let completedAt: Date | null | undefined;
  if (isDone && oldStatus !== "done") completedAt = now;
  else if (!isDone && oldStatus === "done") completedAt = null;
  else completedAt = undefined;
  return { status: nextStatus, completed: isDone, completedAt };
}

/** A review request fires only on the transition INTO in-review (task has a project). */
export function isReviewRequestTransition(oldStatus: TaskStatus, nextStatus: TaskStatus): boolean {
  return oldStatus !== "in-review" && nextStatus === "in-review";
}

// ---------------------------------------------------------------------------
// Completion / award arithmetic (frozen: penalty CAN exceed points)
// ---------------------------------------------------------------------------

/**
 * daysLate = ceil((completion - dueDate) / 24h); <= 0 -> 0; penalty = daysLate * points.
 * No timezone normalization: raw Date arithmetic, exactly as the legacy gateway.
 */
export function calculateLatePenalty(
  task: { points: number; dueDate?: string | null },
  completionDate: Date,
): number {
  if (!task.dueDate) return 0;
  const dueDate = new Date(task.dueDate);
  const timeDiff = completionDate.getTime() - dueDate.getTime();
  const daysLate = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  if (daysLate <= 0) return 0;
  return daysLate * task.points;
}

/** Awarded points = points - latePenalty (frozen quirk: may go NEGATIVE). */
export function awardPointsForCompletion(
  task: { points: number; dueDate?: string | null },
  completionDate: Date,
): number {
  return task.points - calculateLatePenalty(task, completionDate);
}

/** `status !== "done" && (public || assignedTo !== null)` (gateway :487-489). */
export function canBeCompleted(task: Pick<Task, "status" | "taskVisibility" | "assignedTo">): boolean {
  return task.status !== "done" && (task.taskVisibility === "public" || task.assignedTo !== null);
}

/**
 * D-41 claim precondition (gateway :860-867, DB part excluded): never reassigns —
 * public/global tasks and tasks with an assignedTo column are not claimable. The
 * "no rows in task_assignees" half is checked by the caller through the port.
 */
export function isClaimable(task: Pick<Task, "taskVisibility" | "isGlobal" | "assignedTo">): boolean {
  return task.taskVisibility !== "public" && !task.isGlobal && task.assignedTo == null;
}

// ---------------------------------------------------------------------------
// task_user_progress semantics (frozen from gateway :221-240 and :439-450)
// ---------------------------------------------------------------------------

export type ProgressPatch = {
  status: TaskStatus;
  pickedAt: Date | null;
  completedAt: Date | null;
  awardedPoints: number;
};

/**
 * updateTask public progress branch: pickedAt is sticky (existing wins), completedAt is
 * rewritten on every write (done ? now : null), awardedPoints is PRESERVED from the row.
 */
export function progressPatchForStatus(
  existing: { pickedAt?: Date | null; awardedPoints?: number } | null,
  status: TaskStatus,
  now: Date,
): ProgressPatch {
  return {
    status,
    pickedAt: existing?.pickedAt ?? (status !== "to-do" ? now : null),
    completedAt: status === "done" ? now : null,
    awardedPoints: existing?.awardedPoints ?? 0,
  };
}

/** completeTask public branch: pickedAt sticky, completedAt = now, awarded = computed award. */
export function progressPatchForCompletion(
  existing: { pickedAt?: Date | null } | null,
  now: Date,
  awardedPoints: number,
): ProgressPatch {
  return {
    status: "done",
    pickedAt: existing?.pickedAt ?? now,
    completedAt: now,
    awardedPoints,
  };
}

/** Public completion is idempotent per user: completedAt OR status done blocks re-completion. */
export function isProgressAlreadyCompleted(
  progress: { completedAt?: Date | null; status?: TaskStatus } | null,
): boolean {
  return Boolean(progress?.completedAt) || progress?.status === "done";
}

/**
 * JSON read model identical to `backend/models/Task.toJSON()` (the shape routes already
 * read — batch 0.4 finding). Kept here so domain-built clones serialize the same way.
 */
export function serializeTask(task: Omit<Task, "toJSON">): any {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignedTo: task.assignedTo,
    assigneeIds: task.assigneeIds || [],
    projectId: task.projectId,
    dueDate: task.dueDate,
    points: task.points,
    completed: task.completed,
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
    taskVisibility: task.taskVisibility,
    isGlobal: task.isGlobal,
    groupTaskId: task.groupTaskId ?? null,
    createdBy: task.createdBy,
  };
}

/**
 * Read-model clone (gateway withActorProgress :768-781): the task row is presented with
 * the ACTOR's own progress; assignedTo becomes the progress owner (null when none).
 * `toJSON` is attached explicitly (prototype methods do not survive object spread).
 */
export function withActorProgress(
  task: Task,
  progress: { status: TaskStatus; completedAt: Date | null },
  actorId: number | null,
): Task {
  const data = {
    ...task,
    status: progress.status,
    completed: progress.status === "done",
    completedAt: progress.completedAt,
    assignedTo: actorId,
  };
  return { ...data, toJSON: () => serializeTask(data) };
}

// ---------------------------------------------------------------------------
// Assignee attachment (frozen from gateway :811-840)
// ---------------------------------------------------------------------------

/**
 * Merge task_assignees rows into the task view. `assigneeIds === null` means the table is
 * unavailable: fall back to [assignedTo]. When available, assignedTo becomes the FIRST
 * assignee (ordered by assignedAt ASC by the port), falling back to the existing value.
 */
export function applyAssigneeIds(
  task: Pick<Task, "assignedTo" | "assigneeIds">,
  assigneeIds: number[] | null,
): { assignedTo: number | null; assigneeIds: number[] } {
  if (assigneeIds === null) {
    return {
      assignedTo: task.assignedTo ?? null,
      assigneeIds: task.assignedTo ? [task.assignedTo] : [],
    };
  }
  return {
    assignedTo: assigneeIds[0] ?? task.assignedTo ?? null,
    assigneeIds,
  };
}

// ---------------------------------------------------------------------------
// Rejection FIX line (frozen from gateway :699-706; todayLabel injected)
// ---------------------------------------------------------------------------

export function appendFixInstruction(
  description: string | null | undefined,
  reason: string,
  todayLabel: string,
): string {
  const fixLine = `FIX (${todayLabel}): ${reason}`;
  return description?.trim() ? `${description.trim()}\n\n${fixLine}` : fixLine;
}

// ---------------------------------------------------------------------------
// Visibility / authorisation policy (pure over roles + resolved booleans)
// ---------------------------------------------------------------------------

/** listTasksForUser manager visibility (gateway :39-43): COORDENADOR/GERENTE/COLABORADOR. */
export function canListAllTasks(actorRoles: unknown): boolean {
  return hasAnyRole(actorRoles, ["COORDENADOR", "GERENTE", "COLABORADOR"]);
}

/** Global quests need MANAGE_USERS on the CREATOR's roles (gateway :92-95). */
export function canCreateGlobalQuest(creatorRoles: unknown): boolean {
  return hasPermission(creatorRoles, "MANAGE_USERS");
}

/**
 * Public progress branch gate (gateway :203-207): public visibility + progress table
 * available + payload restricted to {status, assignedTo}.
 */
export function usesPublicProgressBranch(
  visibility: TaskVisibility,
  progressTableAvailable: boolean,
  data: Record<string, unknown>,
): boolean {
  return visibility === "public" && progressTableAvailable && isPublicProgressOnlyUpdate(data);
}

/** Moving a public task on behalf of ANOTHER user needs MANAGE_TASKS or MANAGE_USERS (gateway :208-211). */
export function isForeignPublicMoveDenied(
  requestedAssignee: number | null | undefined,
  actorId: number,
  canManage: boolean,
): boolean {
  return (
    requestedAssignee !== undefined &&
    requestedAssignee !== null &&
    requestedAssignee !== actorId &&
    !canManage
  );
}

/** Status-only updates on NON-public tasks require assignment (gateway :260-266). */
export function canManipulateStatusOnly(visibility: TaskVisibility, isAssigned: boolean): boolean {
  return visibility !== "public" && isAssigned;
}

/** Editing a completed task: role list OR project creator/leader (gateway :307-322). */
export function canModifyCompletedTask(actorRoles: unknown, isProjectCreatorOrLeader: boolean): boolean {
  return (
    hasAnyRole(actorRoles, ["COORDENADOR", "LABORATORISTA", "GERENTE_PROJETO", "GERENTE"]) ||
    isProjectCreatorOrLeader
  );
}

/** Non-public completion needs assignment or MANAGE_TASKS/MANAGE_USERS (gateway :424-431). */
export function isCompletePermissionDenied(
  visibility: TaskVisibility,
  isAssigned: boolean,
  canManageTasks: boolean,
  canManageUsers: boolean,
): boolean {
  return visibility !== "public" && !isAssigned && !canManageTasks && !canManageUsers;
}

/** GERENTE_PROJETO who leads the project AND is assigned cannot self-complete (gateway :464-470). */
export function isLeaderSelfCompleteDenied(
  isGerenteProjeto: boolean,
  isProjectLeader: boolean,
  isAssigned: boolean,
): boolean {
  return isGerenteProjeto && isProjectLeader && isAssigned;
}

export type ApprovalDecision =  | { allowed: true }
  | { allowed: false; reason: "self" | "no-permission" }
  | { allowed: "needs-leader-check" };

/**
 * approve/reject authority (gateway :537-560 / :608-631), pure part:
 *  - isSelf without MANAGE_USERS -> deny "self";
 *  - MANAGE_USERS -> allow;
 *  - GERENTE_PROJETO + project task -> caller must verify project.leaderId === approver
 *    ("needs-leader-check"; deny "not-leader" when it fails);
 *  - otherwise deny "no-permission".
 */
export function approvalDecision(input: {
  canApproveAny: boolean;
  isSelf: boolean;
  canApproveProjectTask: boolean;
}): ApprovalDecision {
  if (input.isSelf && !input.canApproveAny) return { allowed: false, reason: "self" };
  if (input.canApproveAny) return { allowed: true };
  if (input.canApproveProjectTask) return { allowed: "needs-leader-check" };
  return { allowed: false, reason: "no-permission" };
}

// ---------------------------------------------------------------------------
// New-task record (validation frozen from models/Task.create — same messages)
// ---------------------------------------------------------------------------

export interface NewTaskInput {
  title?: unknown;
  description?: string | null;
  status: TaskStatus;
  priority: Task["priority"];
  assignedTo?: number | null;
  assigneeIds?: number[];
  projectId?: number | null;
  dueDate?: string | null;
  points?: number;
  completed?: boolean;
  taskVisibility?: TaskVisibility;
  isGlobal?: boolean;
  groupTaskId?: number | null;
  createdBy?: number | null;
}

/**
 * Validate + normalize a new task (models/Task.create semantics, ValidationError typed):
 * title trimmed (required, <=200), description <=1000, points >=0; the quirk
 * `completedAt = now when completed OR status done` (even with completed=false) is frozen.
 */
export function createTaskRecord(data: NewTaskInput, now: Date): ITask {
  const title = String(data.title || "").trim();
  if (!title) throw new ValidationError("Título da tarefa é obrigatório");
  if (title.length > 200) throw new ValidationError("Título da tarefa não pode ter mais de 200 caracteres");
  if (data.description && data.description.length > 1000) {
    throw new ValidationError("Descrição da tarefa não pode ter mais de 1000 caracteres");
  }
  if ((data.points || 0) < 0) throw new ValidationError("Pontos da tarefa não podem ser negativos");

  return {
    title,
    description: data.description || null,
    status: data.status,
    priority: data.priority,
    assignedTo: data.assignedTo || null,
    assigneeIds: data.assigneeIds || (data.assignedTo ? [data.assignedTo] : []),
    projectId: data.projectId || null,
    dueDate: data.dueDate || null,
    points: data.points || 0,
    completed: data.completed || false,
    completedAt: data.completed || data.status === "done" ? now : null,
    taskVisibility: data.taskVisibility || "delegated",
    isGlobal: data.isGlobal || false,
    groupTaskId: data.groupTaskId ?? null,
    createdBy: data.createdBy ?? null,
  };
}

/** Wrap plain task data into the `Task` view the ports return (toJSON = serializeTask). */
export function toTaskView(task: ITask): Task {
  return { ...task, toJSON: () => serializeTask(task) };
}
