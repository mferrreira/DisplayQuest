import type { Task } from "@/entities/task"
import { isTaskDueToday, isTaskOverdue } from "./move-rules"
import { isAssignedToUser } from "./is-assigned-to-user"

export interface BoardTaskFilters {
  projectId?: number | null
  assigneeId?: number | null
  activityId?: number | null
  overdue?: boolean
  dueToday?: boolean
  search?: string
}

/** Shared client-side recut for the board and the Home summary. */
export function filterBoardTasks(tasks: Task[], filters: BoardTaskFilters): Task[] {
  let filtered = tasks
  if (filters.projectId) filtered = filtered.filter(task => task.projectId === filters.projectId)
  if (filters.assigneeId) filtered = filtered.filter(task => isAssignedToUser(task, filters.assigneeId))
  if (filters.activityId) filtered = filtered.filter(task => task.activityId === filters.activityId)
  if (filters.overdue || filters.dueToday) {
    filtered = filtered.filter(task =>
      (Boolean(filters.overdue) && isTaskOverdue(task)) ||
      (Boolean(filters.dueToday) && isTaskDueToday(task)),
    )
  }
  if (filters.search) {
    const query = filters.search.toLowerCase()
    filtered = filtered.filter(task => task.title.toLowerCase().includes(query))
  }
  return filtered
}
