/**
 * DailyLog — pure domain contract of the work aggregate (SPEC §4.5).
 * Authored here since the type-only mirror source (`backend/models/DailyLog.ts`) was removed
 * in D-2 (DEC-142). The daily-log upsert rule moves here as behaviour in OND3-B2.
 */
export interface DailyLog {
  id?: number;
  userId: number;
  projectId?: number | null;
  date: Date;
  note?: string | null;
  workSessionId?: number | null;
  createdAt?: Date;
}
