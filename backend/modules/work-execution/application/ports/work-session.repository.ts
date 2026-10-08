import type { WorkSession, WorkSessionStatus } from "@/backend/domain";

/**
 * WorkSessionRepositoryPort (OND3-B2, R2) — persistence seam of the work-session aggregate.
 *
 * Semantics frozen by the golden matrix (OND3-B1) and mirrored from
 * `backend/repositories/WorkSessionRepository`: reads ordered by startTime desc;
 * `findActiveByUserId` = first ACTIVE session of the user; `update` merges only the keys
 * present in the partial and returns the persisted row.
 *
 * B10 · D9 (DEC-125): the RECORD status is `WorkSessionStatus` (write paths and reads);
 * `findByStatus` keeps a plain string — it is a query filter, not a record value, and the
 * measured behavior of an unknown filter is "no match" (frozen).
 */
export interface NewWorkSession {
  userId: number;
  userName: string;
  startTime: Date;
  endTime?: Date | null;
  duration?: number | null;
  activity?: string | null;
  location?: string | null;
  projectId?: number | null;
  status: WorkSessionStatus;
}

export interface WorkSessionRepositoryPort {
  findById(id: number): Promise<WorkSession | null>;
  findActiveByUserId(userId: number): Promise<WorkSession | null>;
  findByUserId(userId: number): Promise<WorkSession[]>;
  findAll(): Promise<WorkSession[]>;
  findByStatus(status: string): Promise<WorkSession[]>;
  create(session: NewWorkSession): Promise<WorkSession>;
  update(id: number, updates: Partial<WorkSession>): Promise<WorkSession>;
  delete(id: number): Promise<void>;
  replaceSessionTasks(sessionId: number, taskIds: number[]): Promise<void>;
}
