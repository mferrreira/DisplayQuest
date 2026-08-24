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

export const taskPrioritySchema = z.enum(["low", "medium", "high"]);
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
});
export type Task = z.infer<typeof taskSchema>;
