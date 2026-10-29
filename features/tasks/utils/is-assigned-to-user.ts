import type { Task } from "@/entities/task"

/**
 * Whether a task is assigned to the given user, considering both the legacy
 * `assignedTo` field and the multi-assignee `assigneeIds` list.
 */
export function isAssignedToUser(task: Task, userId?: number | null): boolean {
  if (!userId) return false
  const assignees = task.assigneeIds ?? []
  const hasAssignees = assignees.length > 0 || task.assignedTo != null
  // R10 (plan-v11, S10): quest global ou pública sem projeto e sem responsável conta
  // como atribuída a todo usuário no filtro "você" da toolbar. Nenhum dado é escrito.
  if (!hasAssignees && !task.projectId && (task.isGlobal || task.taskVisibility === "public")) {
    return true
  }
  return task.assignedTo === userId || assignees.includes(userId)
}
