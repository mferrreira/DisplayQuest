/**
 * WorkSession — pure domain contract of the work aggregate (SPEC §4.5).
 *
 * `status` is `WorkSessionStatus` (B10 · D9, fecha GAP-02 — DEC-125): the column remains a
 * plain String, but the domain record carries the three-value vocabulary the backend writes,
 * and repository adapters reconcile the column through `toWorkSessionStatus`. The old note
 * ("narrowing would make the domain stricter than the adapters carry") described the legacy
 * gateway, removed in OND9-B1; the live repositories write only enum values (measured: the
 * instance holds only `completed` rows today).
 *
 * `duration` stays `number | null` (the column is a String, the mappers type it as a nullable
 * number).
 */
import type { WorkSessionStatus } from "./WorkSessionStatus";

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
  status: WorkSessionStatus;
  createdAt?: Date;
  updatedAt?: Date;
}
