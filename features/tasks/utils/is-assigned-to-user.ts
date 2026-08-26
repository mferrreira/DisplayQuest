import type { Task } from "@/entities/task"

/**
 * Whether a task is assigned to the given user, considering both the legacy
 * `assignedTo` field and the multi-assignee `assigneeIds` list.
 */
export function isAssignedToUser(task: Task, userId?: number | null): boolean {
  if (!userId) return false
  return task.assignedTo === userId || (task.assigneeIds ?? []).includes(userId)
}
