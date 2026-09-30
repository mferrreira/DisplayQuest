/**
 * DailyLog — pure domain contract of the work aggregate (SPEC §4.5).
 * Type-only mirror of the `backend/models/DailyLog.ts` class fields. The daily-log upsert rule
 * moves here as behaviour in OND3-B2.
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
