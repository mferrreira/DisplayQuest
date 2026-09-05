/**
 * Scheduled auto-pause times for work sessions (America/Sao_Paulo).
 *
 * A session that is still active when a scheduled pause time passes must be
 * paused at that time. Shared between the backend normalization gateway and
 * the client-side floating session timer.
 */

export const SESSION_TIMEZONE = "America/Sao_Paulo";

export const SCHEDULED_PAUSE_TIMES = ["09:30", "12:00", "15:00", "17:00"] as const;

export const MAX_STRETCH_SEC = 9 * 3600;

const MINUTE_MS = 60_000;

// DateTimeFormat instances are stateless and expensive to construct (10-50ms
// on Firefox/SpiderMonkey with a timeZone). Build once and reuse: the timer
// components call these helpers on every render tick.
const TZ_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: SESSION_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const DATE_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: SESSION_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Offset (ms) of SESSION_TIMEZONE at the given instant. Positive = west of UTC. */
function tzOffsetMs(instant: Date): number {
  const parts = TZ_FORMATTER.formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/** Y/M/D wall-clock date in SESSION_TIMEZONE at the given instant. */
function spDateParts(instant: Date): { y: number; m: number; d: number } {
  const [y, m, d] = DATE_PARTS_FORMATTER.format(instant).split("-").map(Number);
  return { y, m, d };
}

/** Convert a wall-clock time on a given SP calendar day to a UTC Date. */
function spWallTimeToDate(y: number, m: number, d: number, hhmm: string): Date {
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two-pass correction handles DST boundaries.
  let ts = guess - tzOffsetMs(new Date(guess));
  ts = guess - tzOffsetMs(new Date(ts));
  return new Date(ts);
}

/** All pause instants of the SP calendar day containing `instant`. */
function pauseInstantsOfDay(instant: Date): Date[] {
  const { y, m, d } = spDateParts(instant);
  return SCHEDULED_PAUSE_TIMES.map((t) => spWallTimeToDate(y, m, d, t));
}

/** Most recent scheduled pause already elapsed (SP time), or null if none today. */
export function getLastElapsedScheduledPause(now: Date): Date | null {
  const instants = pauseInstantsOfDay(now);
  let result: Date | null = null;
  for (const p of instants) {
    if (p.getTime() <= now.getTime()) result = p;
  }
  return result;
}

/** Next scheduled pause strictly after `now` (today's or tomorrow's 09:30). */
export function getNextScheduledPause(now: Date): Date {
  for (const p of pauseInstantsOfDay(now)) {
    if (p.getTime() > now.getTime()) return p;
  }
  // Tomorrow's first pause.
  const tomorrow = new Date(now.getTime() + 24 * 60 * MINUTE_MS);
  const { y, m, d } = spDateParts(tomorrow);
  return spWallTimeToDate(y, m, d, SCHEDULED_PAUSE_TIMES[0]);
}

/** Whole minutes (ceiling) until the next scheduled pause. */
export function getMinutesUntilNextPause(now: Date): number {
  return Math.max(
    0,
    Math.ceil((getNextScheduledPause(now).getTime() - now.getTime()) / MINUTE_MS),
  );
}

/**
 * Earliest scheduled pause that occurred strictly after `startTime` and at or
 * before `now`. This is the moment an active session started before a pause
 * should have been automatically paused. Returns null when no pause was
 * crossed (session may stay active).
 */
export function toSafeDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * Earliest scheduled pause that occurred strictly after `startTime` and at or
 * before `now`. This is the moment an active session started before a pause
 * should have been automatically paused. Returns null when no pause was
 * crossed (session may stay active).
 */
export function getMissedScheduledPause(
  startTime: Date | string,
  now: Date | string = new Date(),
): Date | null {
  const startMs = toSafeDate(startTime).getTime()
  const nowMs = toSafeDate(now).getTime()
  let missed: Date | null = null
  // Scan SP calendar days from start through now (handles multi-day/weekend).
  let cursor = new Date(startMs)
  const maxDays = 60
  for (let i = 0; i < maxDays; i++) {
    for (const p of pauseInstantsOfDay(cursor)) {
      if (p.getTime() > startMs && p.getTime() <= nowMs) {
        if (!missed || p.getTime() < missed.getTime()) missed = p
      }
    }
    const { y: cy, m: cm, d: cd } = spDateParts(cursor)
    const { y: ny, m: nm, d: nd } = spDateParts(toSafeDate(now))
    if (cy === ny && cm === nm && cd === nd) break
    cursor = new Date(cursor.getTime() + 24 * 60 * MINUTE_MS)
    if (cursor.getTime() > nowMs + 24 * 60 * MINUTE_MS) break
  }
  return missed
}
