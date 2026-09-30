/**
 * TaskVerificationPort (OND3-B2, R2) — read-only check used when attaching completed tasks
 * to a finalized session. The adapter queries the tasks table; the RULES (count match,
 * same-project) live in the use cases (frozen by golden OND3-B1).
 */
export interface CompletedTaskRef {
  id: number;
  projectId: number | null;
}

export interface TaskVerificationPort {
  /** Tasks with the given ids that are completed AND assigned to this user. */
  findCompletedAssignedTasks(userId: number, taskIds: number[]): Promise<CompletedTaskRef[]>;
}
