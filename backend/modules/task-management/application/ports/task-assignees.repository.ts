/**
 * TaskAssigneesPort — OND4-B3 (R1). The `task_assignees` compat seam (multi-assignee
 * table behind the legacy `assignedTo` column). `isAvailable()` is part of the contract:
 * the legacy gateway branches on the table being absent (fallback [assignedTo]).
 */
export interface TaskAssigneesPort {
  isAvailable(): boolean
  /** userIds ordered by assignedAt ASC (the order `assignedTo = assignees[0]` depends on). */
  listUserIdsByTaskId(taskId: number): Promise<number[]>
  listTaskIdsByUserId(userId: number): Promise<number[]>
  listUserIdsByTaskIds(taskIds: number[]): Promise<Map<number, number[]>>
  isUserAssigned(taskId: number, userId: number): Promise<boolean>
  /** Replace-all semantics (deleteMany + createMany, deduped to positive integers). */
  replaceAssignees(taskId: number, userIds: number[], assignedBy?: number | null): Promise<void>
}
