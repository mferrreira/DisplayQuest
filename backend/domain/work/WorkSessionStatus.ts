/**
 * WorkSessionStatus — pure domain enum (SPEC §4.5).
 *
 * `work_sessions.status` is a plain String column in prisma/schema.prisma. The three values
 * are the ones the backend writes (the repositories write exactly "active", "paused" and
 * "completed"). B10 · D9 (DEC-125, fecha GAP-02): `WorkSession.status` now carries this type,
 * and `toWorkSessionStatus` is the read-boundary reconciliation — repository adapters map
 * Prisma rows through it, so a row carrying a value outside the vocabulary fails loudly
 * (naming the value) instead of leaking an untyped string into the domain.
 */
import { ValidationError } from "../errors/DomainError";

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

export function toWorkSessionStatus(value: unknown): WorkSessionStatus {
  if (!isWorkSessionStatus(value)) {
    throw new ValidationError(`Status de sessão inválido: ${JSON.stringify(value)}`);
  }
  return value;
}
