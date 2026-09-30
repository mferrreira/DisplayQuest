/**
 * OND7-B2 — pure project-hours rules (SPEC §4.5, DEC-20 pattern).
 *
 * Extracted VERBATIM from the private helpers + window arithmetic of
 * `PrismaReportingGateway` (golden OND7-B1). The week arithmetic uses date-fns with
 * `weekStartsOn: 1` on the LOCAL clock of the machine — same library and options the
 * gateway used, so the outputs are identical (RG-01: date-fns is a pure function library;
 * the core still knows no ORM/framework/adapter). `now` is always a parameter (no clock
 * access in the core).
 *
 * Frozen quirks (golden OND7-B1):
 *   - QUIRK-7A: `hoursTimeWindow` returns null unless BOTH bounds are present — the gateway
 *     ignored partial ranges entirely.
 *   - QUIRK-7B: the weekly-history window is [startOfWeek, endOfWeek) — `lt` endOfWeek.
 *   - QUIRK-7L: `getProjectWeeklyHours` does NOT normalize weekStart to Monday — the window
 *     starts at the raw instant.
 *   - QUIRK-7H: `hoursByUser[].sessions` carries the RAW session rows (with relations) —
 *     preserved as `unknown[]`.
 *   - QUIRK-7C contrast: reset reports `savedHours` as `toFixed(1)` string; create reports
 *     `totalHours` as number.
 */
import { endOfWeek, format, startOfWeek, subWeeks } from "date-fns"

const WEEK_OPTIONS = { weekStartsOn: 1 } as const

/** Monday-based local week containing `date`. */
export function weekWindowFor(date: Date): { start: Date; end: Date } {
  return {
    start: startOfWeek(date, WEEK_OPTIONS),
    end: endOfWeek(date, WEEK_OPTIONS),
  }
}

/**
 * Hours-query time window (findCompletedSessions spread, gateway:532-539): applied ONLY when
 * both bounds are present (QUIRK-7A). Returns null for partial ranges.
 */
export function hoursTimeWindow(weekStart?: Date, weekEnd?: Date): { gte: Date; lte: Date } | null {
  if (weekStart && weekEnd) {
    return { gte: weekStart, lte: weekEnd }
  }
  return null
}

/** Weekly-history query window for a reference instant (QUIRK-7B: `lt` endOfWeek). */
export function weeklyHistoryWindow(weekStart: Date): { gte: Date; lt: Date } {
  return {
    gte: startOfWeek(weekStart, WEEK_OPTIONS),
    lt: endOfWeek(weekStart, WEEK_OPTIONS),
  }
}

/** Project weekly-hours window: raw start..endOfWeek(raw) (QUIRK-7L). */
export function projectWeeklyHoursWindow(weekStart: Date): { gte: Date; lte: Date } {
  return {
    gte: weekStart,
    lte: endOfWeek(weekStart, WEEK_OPTIONS),
  }
}

/**
 * Rolling week windows for the history endpoint (gateway:204-223): i=0..count-1 over
 * subWeeks(now, i), start normalized to Monday, end from the RAW subWeeks instant (same week
 * either way).
 */
export function rollingWeekWindows(now: Date, count: number): Array<{ start: Date; end: Date }> {
  const windows: Array<{ start: Date; end: Date }> = []
  for (let i = 0; i < count; i++) {
    const weekStart = subWeeks(now, i)
    windows.push({
      start: startOfWeek(weekStart, WEEK_OPTIONS),
      end: endOfWeek(weekStart, WEEK_OPTIONS),
    })
  }
  return windows
}

/** History month selector: `Math.max(1, months || 4)` weeks*4 (gateway:201) — months=0 falls
 * to the default 4 (falsy ||), NOT to 1. */
export function historyWeekCount(months?: number): number {
  return Math.max(1, months || 4) * 4
}

/** dd/MM/yyyy label the history/stats endpoints emit. */
export function formatWeekDate(date: Date): string {
  return format(date, "dd/MM/yyyy")
}

/** SUM(duration || 0) / 3600. */
export function hoursFromDurations(sessions: readonly { duration?: number | null }[]): number {
  return sessions.reduce((sum, session) => sum + (session.duration || 0), 0) / 3600
}

/** totalHours / weeks.length, 0 when no weeks (gateway:231). */
export function averageHoursPerWeek(totalHours: number, weekCount: number): number {
  return weekCount > 0 ? totalHours / weekCount : 0
}

/** A completed-session row with the relations findCompletedSessions includes. */
export interface HoursSessionRow {
  id: number
  userId: number
  userName: string | null
  startTime: Date
  endTime: Date | null
  duration: number | null
  activity: string | null
  location: string | null
  tasks: readonly { task: unknown }[]
}

/** ProjectHoursResult read model (contracts mirror this shape). */
export interface ProjectHoursAggregate {
  projectId: number
  totalHours: number
  sessionCount: number
  hoursByUser: Array<{
    userId: number
    userName: string | null
    totalHours: number
    sessions: unknown[]
  }>
  sessions: Array<{
    id: number
    userId: number
    userName: string
    startTime: string
    endTime: string | null
    duration: number | null
    activity: string | null
    location: string | null
    linkedTasks: unknown[]
  }>
}

/**
 * buildProjectHoursResult (gateway:582-622). hoursByUser groups by userId keyed on the
 * denormalized `userName` column and carries the RAW rows (QUIRK-7H); the flat `sessions`
 * list maps to ISO strings with `linkedTasks = tasks[].task`.
 */
export function aggregateProjectHours(
  projectId: number,
  sessions: readonly HoursSessionRow[],
): ProjectHoursAggregate {
  const totalHours = sessions.reduce((sum, session) => sum + (session.duration || 0), 0) / 3600

  const hoursByUserMap = sessions.reduce<Record<number, {
    userId: number
    userName: string | null
    totalHours: number
    sessions: unknown[]
  }>>((acc, session) => {
    if (!acc[session.userId]) {
      acc[session.userId] = {
        userId: session.userId,
        userName: session.userName,
        totalHours: 0,
        sessions: [],
      }
    }

    acc[session.userId].totalHours += (session.duration || 0) / 3600
    acc[session.userId].sessions.push(session)
    return acc
  }, {})

  return {
    projectId,
    totalHours,
    sessionCount: sessions.length,
    hoursByUser: Object.values(hoursByUserMap),
    sessions: sessions.map((session) => ({
      id: session.id,
      userId: session.userId,
      userName: session.userName as string,
      startTime: session.startTime.toISOString(),
      endTime: session.endTime ? session.endTime.toISOString() : null,
      duration: session.duration,
      activity: session.activity,
      location: session.location,
      linkedTasks: session.tasks.map((sessionTask) => sessionTask.task),
    })),
  }
}

/** A weekly_hours_history row as the stats read sees it. */
export interface WeeklyHoursStatRow {
  totalHours: number
}

/** Sum of totalHours over a week's history rows. */
export function sumWeeklyHours(rows: readonly WeeklyHoursStatRow[]): number {
  return rows.reduce((sum, row) => sum + row.totalHours, 0)
}

/** currentWeek.topUsers slice size (gateway:345). */
export const TOP_USERS_LIMIT = 5
