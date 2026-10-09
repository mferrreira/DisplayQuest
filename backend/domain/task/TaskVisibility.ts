/**
 * TaskVisibility — pure domain enum (SPEC §4.5).
 *
 * `tasks.taskVisibility` is a plain String column (prisma/schema.prisma :92, default
 * "delegated"). Values mirror what the task gateway writes and what the UI consumes.
 */
export const TaskVisibility = {
  PUBLIC: "public",
  DELEGATED: "delegated",
  PRIVATE: "private",
} as const;

export type TaskVisibility = (typeof TaskVisibility)[keyof typeof TaskVisibility];

export const TASK_VISIBILITIES = Object.values(TaskVisibility) as TaskVisibility[];

export function isTaskVisibility(value: unknown): value is TaskVisibility {
  return typeof value === "string" && (TASK_VISIBILITIES as string[]).includes(value);
}
