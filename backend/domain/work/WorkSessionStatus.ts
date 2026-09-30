/**
 * WorkSessionStatus — pure domain enum (SPEC §4.5).
 *
 * `work_sessions.status` is a plain String column in prisma/schema.prisma. The three values
 * are the ones the current backend writes (work-session-service.gateway.ts writes exactly
 * "active", "paused" and "completed").
 */
export const WorkSessionStatus = {
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
} as const;

export type WorkSessionStatus = (typeof WorkSessionStatus)[keyof typeof WorkSessionStatus];

export const WORK_SESSION_STATUSES = Object.values(WorkSessionStatus) as WorkSessionStatus[];

export function isWorkSessionStatus(value: unknown): value is WorkSessionStatus {
  return typeof value === "string" && (WORK_SESSION_STATUSES as string[]).includes(value);
}
