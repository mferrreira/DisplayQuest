/** Minimal actor view the task use cases need from the users table. */
export interface TaskActorRecord {
  id: number
  name: string
  roles: string[]
  completedTasks: number
}

/** Public user summary used by the global-progress roster (OND4-B4). */
export interface TaskUserSummary {
  id: number
  name: string
  email: string
  roles: string[]
}

/**
 * TaskActorsPort — OND4-B3 (R1). User reads + the `completedTasks` counter increment +
 * project memberships. The legacy gateway did `user.completedTasks += 1;
 * userRepository.update(user)` (a full-row write); the port narrows that to the observable
 * effect (the counter), which is what the contract suite compares.
 */
export interface TaskActorsPort {
  findById(id: number): Promise<TaskActorRecord | null>
  incrementCompletedTasks(userId: number): Promise<void>
  getUserProjectMemberships(userId: number): Promise<{ projectId: number }[]>
  /** ACTIVE users ordered by name ASC (the global-progress roster, OND4-B4). */
  listActiveUsers(): Promise<TaskUserSummary[]>
}
