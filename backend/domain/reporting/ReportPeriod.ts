/**
 * ReportPeriod — pure domain enum + period windows (SPEC §4.5; OND7-B2).
 *
 * `project_reports.periodType` is a plain String column (prisma/schema.prisma :199). The values
 * mirror the period types the reporting gateway produces and the weekly-hours history reads.
 *
 * OND7-B2: the SP-anchored window arithmetic moved VERBATIM from
 * `lib/constants/report-periods.ts` (which is now a thin re-export of this file — same
 * pattern as `lib/auth/rbac.ts` in OND2). Windows are anchored on America/Sao_Paulo civil
 * time (no DST since 2019, fixed UTC-3):
 *   - weekly: Monday..Sunday
 *   - biweekly: 1st–15th and 16th–end of month
 *   - monthly / semiannual / annual: calendar based
 */
export const ReportPeriod = {
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  MONTHLY: "monthly",
  SEMIANNUAL: "semiannual",
  ANNUAL: "annual",
} as const;

export type ReportPeriod = (typeof ReportPeriod)[keyof typeof ReportPeriod];

export const REPORT_PERIODS = Object.values(ReportPeriod) as ReportPeriod[];

export function isReportPeriod(value: unknown): value is ReportPeriod {
  return typeof value === "string" && (REPORT_PERIODS as string[]).includes(value);
}

/** One report window: inclusive [start, end] instants + human label (frozen strings). */
export interface ReportPeriodWindow {
  type: ReportPeriod;
  /** Inclusive window start (UTC instant of America/Sao_Paulo local midnight). */
  start: Date;
  /** Inclusive window end (last millisecond of the final local day). */
  end: Date;
  label: string;
}

const SP_OFFSET_MS = 3 * 60 * 60 * 1000 // America/Sao_Paulo = UTC-3 (no DST since 2019)
const DAY_MS = 24 * 60 * 60 * 1000

const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

interface SpParts {
  year: number
  month: number // 0-based
  day: number
  weekday: number // 0=Sun .. 6=Sat
}

/** Wall-clock parts of an instant as seen in America/Sao_Paulo. */
function spParts(instant: Date): SpParts {
  const shifted = new Date(instant.getTime() - SP_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  }
}

/** Instant whose Sao_Paulo wall clock equals the given local parts at hh:mm:00.000. */
function spInstant(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month, day, hour, minute, 0, 0) + SP_OFFSET_MS)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function endOfDayInstant(year: number, month: number, day: number): Date {
  return new Date(spInstant(year, month, day, 23, 59).getTime() + 59 * 1000 + 999)
}

function addDaysInstant(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS)
}

/**
 * Computes the report window containing `reference` (moved verbatim from
 * lib/constants/report-periods.ts — golden OND7-B1 pins its outputs).
 */
export function computeReportPeriod(type: ReportPeriod, reference: Date): ReportPeriodWindow {
  const { year, month, day, weekday } = spParts(reference)

  switch (type) {
    case "weekly": {
      const backToMonday = (weekday + 6) % 7
      const startDate = day - backToMonday
      const start = spInstant(year, month, startDate)
      const end = new Date(addDaysInstant(start, 7).getTime() - 1)
      const fmt = (d: Date) => {
        const p = spParts(d)
        return `${pad(p.day)}/${pad(p.month + 1)}`
      }
      return { type, start, end, label: `Semana de ${fmt(start)} a ${fmt(end)}` }
    }

    case "biweekly": {
      const firstHalf = day <= 15
      const startDay = firstHalf ? 1 : 16
      const endDay = firstHalf ? 15 : daysInMonth(year, month)
      const halfLabel = firstHalf ? "1ª" : "2ª"
      return {
        type,
        start: spInstant(year, month, startDay),
        end: endOfDayInstant(year, month, endDay),
        label: `${halfLabel} quinzena de ${MONTHS_PT[month]}/${year}`,
      }
    }

    case "monthly": {
      return {
        type,
        start: spInstant(year, month, 1),
        end: endOfDayInstant(year, month, daysInMonth(year, month)),
        label: `${MONTHS_PT[month]}/${year}`,
      }
    }

    case "semiannual": {
      const firstHalf = month < 6
      const startMonth = firstHalf ? 0 : 6
      const endMonth = firstHalf ? 5 : 11
      return {
        type,
        start: spInstant(year, startMonth, 1),
        end: endOfDayInstant(year, endMonth, daysInMonth(year, endMonth)),
        label: `${firstHalf ? "1º" : "2º"} semestre de ${year}`,
      }
    }

    case "annual": {
      return {
        type,
        start: spInstant(year, 0, 1),
        end: endOfDayInstant(year, 11, 31),
        label: `Ano ${year}`,
      }
    }
  }
}

/** Lists consecutive periods of `type` covering [from..to] (inclusive, by reference instants). */
export function listReportPeriods(type: ReportPeriod, from: Date, to: Date): ReportPeriodWindow[] {
  if (to.getTime() < from.getTime()) return []
  const periods: ReportPeriodWindow[] = []
  let cursor = computeReportPeriod(type, from)

  // Safety bound: at most ~2000 windows (annual over millennia would never loop here).
  for (let i = 0; i < 2000; i++) {
    periods.push(cursor)
    const nextRef = new Date(cursor.end.getTime() + 1)
    if (nextRef.getTime() > to.getTime()) break
    cursor = computeReportPeriod(type, nextRef)
  }
  return periods
}
