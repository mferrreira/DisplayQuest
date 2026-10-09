/**
 * TaskStatus — pure domain enum (SPEC §4.5).
 *
 * `tasks.status` is a plain String column in prisma/schema.prisma (:122, default "to-do"), so
 * the contract of this enum is the set of values the BACKEND writes today
 * (backend/models/Task.ts, backend/modules/task-management/**). Legacy spellings the database
 * still contains (`pending`, `completed`, `in_progress`) are deliberately NOT part of this
 * enum: they belong to the wire-tolerance layer (entities/task.ts `wireTaskStatus`).
 */
export const TaskStatus = {
  TO_DO: "to-do",
  IN_PROGRESS: "in-progress",
  IN_REVIEW: "in-review",
  ADJUST: "adjust",
  DONE: "done",
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TASK_STATUSES = Object.values(TaskStatus) as TaskStatus[];

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as string[]).includes(value);
}
