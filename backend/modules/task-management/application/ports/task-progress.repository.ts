import type { TaskStatus } from "@/backend/domain"

/** Row shape of `task_user_progress` (per-user progress of PUBLIC tasks). */
export interface TaskUserProgressRecord {
  id: number
  taskId: number
  userId: number
  status: TaskStatus
  pickedAt: Date | null
  completedAt: Date | null
  awardedPoints: number
}

export interface TaskProgressUpsertInput {
  taskId: number
  userId: number
  status: TaskStatus
  pickedAt?: Date | null
  completedAt?: Date | null
  awardedPoints?: number
}

/**
 * TaskProgressPort — OND4-B3 (R1). The `task_user_progress` seam; `isAvailable()` is part
 * of the contract (the legacy gateway falls back to task-row semantics when the table is
 * absent — frozen by the golden matrix).
 */
export interface TaskProgressPort {
  isAvailable(): boolean
  findByTaskAndUser(taskId: number, userId: number): Promise<TaskUserProgressRecord | null>
  findByTaskIdsAndUser(taskIds: number[], userId: number): Promise<TaskUserProgressRecord[]>
  upsert(input: TaskProgressUpsertInput): Promise<void>
  /** Progress rows with completedAt set, for the global-progress roster (OND4-B4). */
  listCompletedByTaskIds(taskIds: number[]): Promise<Array<{ taskId: number; userId: number }>>
  /** Legacy completion signal: work_session_tasks links of COMPLETED work sessions. */
  listSessionCompletionsByTaskIds(taskIds: number[]): Promise<Array<{ taskId: number; userId: number }>>
}
