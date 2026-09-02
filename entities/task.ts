/**
 * TASK entity — mirrors prisma/schema.prisma `model tasks` (:79–98),
 * `task_assignees` (:100–112) and `task_user_progress` (:114–131).
 *
 * DB stores status/priority as plain Strings; the backend task-service.gateway validates the
 * value domains below (task-service.gateway.ts). Visibility semantics: public/delegated/private,
 * plus isGlobal flag (product-model.md).
 */
import { z } from "zod";
import { dateTimeString, nullableDateTimeString } from "./user";

export const taskStatusSchema = z.enum(["to-do", "in-progress", "in-review", "adjust", "done"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/**
 * D-17: backend models/Task.ts declares 'low'|'medium'|'high'|'urgent' — the gateway does not
 * narrow it, so 'urgent' can reach the wire. Omitting it here would fail zod parse for the
 * ENTIRE list. UI renders URGENTE badge (kanban parity).
 */
export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const taskVisibilitySchema = z.enum(["public", "delegated", "private"]);
export type TaskVisibility = z.infer<typeof taskVisibilitySchema>;

/** tasks.dueDate is `String?` in the DB — NOT a datetime. Parse defensively at the UI layer. */
export const taskDueDateSchema = z.string().nullable().optional();

export const taskAssigneeSchema = z.object({
  id: z.number().int(),
  taskId: z.number().int(),
  userId: z.number().int(),
  assignedBy: z.number().int().nullable().optional(),
  assignedAt: dateTimeString,
});
export type TaskAssignee = z.infer<typeof taskAssigneeSchema>;

export const taskUserProgressSchema = z.object({
  id: z.number().int(),
  taskId: z.number().int(),
  userId: z.number().int(),
  status: taskStatusSchema.default("to-do"),
  pickedAt: nullableDateTimeString.optional(),
  completedAt: nullableDateTimeString.optional(),
  awardedPoints: z.number().int(),
  createdAt: dateTimeString,
  updatedAt: dateTimeString,
});
export type TaskUserProgress = z.infer<typeof taskUserProgressSchema>;

export const taskSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  /** Legacy single-assignee column kept for backward compat (AGENTS.md). */
  assignedTo: z.number().int().nullable().optional(),
  /**
   * API wire shape (backend/models/Task.ts toJSON :119–136): flat id array.
   * The task_assignees ROWS are backend-internal; they are NOT sent by GET /api/tasks.
   */
  assigneeIds: z.array(z.number().int()).default([]),
  projectId: z.number().int().nullable().optional(),
  dueDate: taskDueDateSchema,
  points: z.number().int(),
  completed: z.boolean(),
  completedAt: nullableDateTimeString.optional(),
  taskVisibility: taskVisibilitySchema.default("delegated"),
  isGlobal: z.boolean().default(false),
  groupTaskId: z.number().int().nullable().optional(),
});
export type Task = z.infer<typeof taskSchema>;

/**
 * D-18 (2026-08-25): the live DB contains rows with LEGACY status values written before the
 * current enum existed (verified: completed=1, pending=2, in_progress=2 on 2026-08-25).
 * The backend passes them through unvalidated (tasks.status is a plain String column), so the
 * wire can carry values outside taskStatusSchema. taskSchema stays STRICT (contract truth,
 * round-trip tests); the WIRE layer uses this explicit, loud normalization map so the board
 * keeps working while the cleanup migration is a pending user decision (state/backlog.md).
 */
const LEGACY_STATUS_MAP: Record<string, TaskStatus> = {
  completed: "done",
  pending: "to-do",
  in_progress: "in-progress",
};

export const wireTaskStatus = z
  .string()
  .transform((value): TaskStatus => {
    if ((taskStatusSchema.options as string[]).includes(value)) return value as TaskStatus;
    const mapped = LEGACY_STATUS_MAP[value];
    if (mapped) {
      console.warn(`[entities/task] legacy status "${value}" → "${mapped}" (D-18)`);
      return mapped;
    }
    console.warn(`[entities/task] unknown status "${value}" → "to-do" (D-18)`);
    return "to-do";
  });

/**
 * Wire-tolerant priority transform: the DB column is a plain String and live rows contain empty
 * strings ("") or legacy values that don't match taskPrioritySchema. Normalize to "medium"
 * (the default) so the entire task list doesn't fail zod parse.
 */
export const wireTaskPriority = z
  .string()
  .transform((value): TaskPriority => {
    if ((taskPrioritySchema.options as string[]).includes(value)) return value as TaskPriority;
    console.warn(`[entities/task] invalid priority "${value}" → "medium"`);
    return "medium";
  });

/** Wire-tolerant task schema used by API endpoints (strict taskSchema remains the contract). */
export const wireTaskSchema = taskSchema.extend({
  status: wireTaskStatus,
  priority: wireTaskPriority,
});
