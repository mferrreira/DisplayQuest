/**
 * WorkSession — pure domain contract of the work aggregate (SPEC §4.5).
 *
 * `status` is intentionally `string`, NOT `WorkSessionStatus`: `work_sessions.status` is a plain
 * String column and the current gateway reads/writes it as a string (`status: string` in
 * backend/models/WorkSession.ts). Narrowing it here would make the domain stricter than the
 * value the adapters carry, which is a behaviour change — batch 0.4 is types-only. Recorded in
 * STATE.json as gap `work-execution.status`; closes in OND3-B2 with the rich entity.
 *
 * `duration` stays `number | null` for the same reason (the column is a String, the model class
 * types it as a nullable number).
 */
export interface WorkSession {
  id?: number;
  userId: number;
  userName: string;
  startTime: Date;
  endTime?: Date | null;
  duration?: number | null;
  activity?: string | null;
  location?: string | null;
  projectId?: number | null;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}
