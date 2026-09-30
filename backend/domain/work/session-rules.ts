/**
 * Session rules — the pure duration/transition rules of the work aggregate (OND3-B2, R2).
 *
 * Moved verbatim (behavior-identical) from the private helpers of
 * `WorkSessionServiceGateway` (golden OND3-B1). The gateway computed these with an implicit
 * `new Date()`; here `now` is a parameter so the rules are deterministic and testable (RG-01:
 * pure — no DB, no framework, no clock access).
 *
 * Frozen quirks (golden OND3-B1):
 *   - `closedSessionDuration` ADDS the stretch to the accumulated duration. On an
 *     already-completed/paused session that means the stretch is double-counted when the
 *     completion branch runs again (updateWorkSession quirk) — preserved, not fixed.
 *   - The stretch of an active session ENDS at the first scheduled pause crossed since
 *     `startTime` when one falls before the close instant, and is capped at MAX_STRETCH_SEC.
 *   - `expiredPausePatch` returns null when no scheduled pause was crossed (session stays active).
 */
import { hasPermission } from "../identity/has-permission";
import { getMissedScheduledPause, MAX_STRETCH_SEC } from "./schedule";
import type { WorkSession } from "./WorkSession";

/** The timing fields the duration rules read. */
export type SessionTiming = Pick<WorkSession, "startTime" | "duration">;

/** Log-note fields the auto-note rule reads. */
export type SessionNoteSource = Pick<WorkSession, "duration" | "activity" | "location">;

function secondsBetween(from: Date, until: Date): number {
  return Math.min(MAX_STRETCH_SEC, Math.max(0, (until.getTime() - from.getTime()) / 1000));
}

/** One active stretch: elapsed seconds between two instants, floored at 0 and capped at
 * MAX_STRETCH_SEC (anti-farm). */
export function stretchSeconds(from: Date, until: Date): number {
  return secondsBetween(from, until);
}

/**
 * Final duration of a session closed at `closedAt`: accumulated duration plus the current
 * stretch, which ends at `closedAt` or earlier at the first scheduled pause crossed since
 * `startTime` (the session should have been auto-paused there). Capped at MAX_STRETCH_SEC.
 */
export function closedSessionDuration(session: SessionTiming, closedAt: Date): number {
  const missedPause = getMissedScheduledPause(session.startTime, closedAt);
  const activeUntil =
    missedPause && missedPause.getTime() <= closedAt.getTime() ? missedPause : closedAt;
  return (session.duration || 0) + secondsBetween(session.startTime, activeUntil);
}

/** The instant an active session must be paused at: the first scheduled pause crossed since
 * its start, or `now` when none was crossed. */
export function pauseInstantFor(startTime: Date, now: Date): Date {
  const missedPause = getMissedScheduledPause(startTime, now);
  return missedPause && missedPause.getTime() <= now.getTime() ? missedPause : now;
}

/**
 * Patch that turns an expired ACTIVE session into a paused one (scheduled auto-pause on
 * read/normalization): paused AT the missed pause instant, not at `now`. Returns null when no
 * scheduled pause was crossed — the session stays active untouched.
 */
export function expiredPausePatch(
  session: SessionTiming & { status: string },
  now: Date,
): { status: "paused"; endTime: Date; duration: number } | null {
  if (session.status !== "active") return null;

  const missedPause = getMissedScheduledPause(session.startTime, now);
  if (!missedPause) return null;

  return {
    status: "paused",
    endTime: missedPause,
    duration: (session.duration || 0) + secondsBetween(session.startTime, missedPause),
  };
}

/** Dedupe + drop non-integer/non-positive ids (frozen by golden). */
export function normalizeTaskIds(taskIds: number[]): number[] {
  return Array.from(
    new Set(
      taskIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
}

/** Log date: explicit command date, else the session endTime, else `now` (frozen by golden). */
export function resolveLogDate(
  date: string | undefined,
  fallbackDate: Date | null | undefined,
  now: Date,
): Date {
  if (date) {
    return new Date(date);
  }
  if (fallbackDate) {
    return fallbackDate;
  }
  return now;
}

/** Auto-note for the daily log of a completed session (format frozen by golden). */
export function resolveLogNote(note: string | undefined, session: SessionNoteSource): string {
  const trimmed = note?.trim();
  if (trimmed) return trimmed;

  const duration = typeof session.duration === "number"
    ? `${Math.floor(session.duration / 60)} minutos`
    : "duração não calculada";
  const activity = session.activity ? `Atividade: ${session.activity}` : "";
  const location = session.location ? `Local: ${session.location}` : "";

  return [
    `Sessão de trabalho finalizada - ${duration}`,
    activity,
    location,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Owner-or-manager policy: the session owner, or any actor holding MANAGE_WORK_SESSIONS. */
export function canActOnSession(
  actorUserId: number,
  actorRoles: string[] | undefined,
  ownerUserId: number,
): boolean {
  return actorUserId === ownerUserId || hasPermission(actorRoles ?? [], "MANAGE_WORK_SESSIONS");
}
