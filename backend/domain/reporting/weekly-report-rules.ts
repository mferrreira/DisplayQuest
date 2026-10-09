/**
 * OND7-B2 — pure weekly-report rules (SPEC §4.5, DEC-20 pattern).
 *
 * Extracted VERBATIM from the private helpers of `PrismaReportingGateway` (golden OND7-B1)
 * so the contract parity (R3, OND7-B3) can prove old-vs-new equivalence. Frozen quirks
 * (golden OND7-B1):
 *   - QUIRK-7I: `normalizeLocalWeekWindow` uses the server-LOCAL clock setHours (NOT
 *     SP-anchored); different raw instants on the same local pair of days collapse to the
 *     same window, and "existing" weekly reports are matched by EXACT instant equality of
 *     the normalized pair.
 *   - Auto summary strings are frozen byte-for-byte, including the fallback
 *     "Nenhuma sessão concluída para este período." and the note fallback
 *     "Sessão finalizada sem observações".
 *   - `uniqueDays` counts UTC calendar days of `startTime.toISOString()` (not local days).
 *   - log `date` = endTime || startTime.
 */

/** Local-clock normalization the legacy gateway did with `setHours` (QUIRK-7I). */
export function normalizeLocalWeekWindow(weekStart: Date, weekEnd: Date): { start: Date; end: Date } {
  const start = new Date(weekStart)
  start.setHours(0, 0, 0, 0)
  const end = new Date(weekEnd)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

/** The fields buildWeeklySummary reads off a completed session row. */
export interface WeeklySummarySession {
  startTime: Date
  project?: { name?: string | null } | null
  tasks?: readonly unknown[]
}

/**
 * Auto-summary of a weekly report (buildWeeklySummary, gateway:645-667). An explicit
 * non-blank summary wins (trimmed); blank/absent falls back to the generated text.
 */
export function buildWeeklySummary(
  summary: string | null | undefined,
  sessions: readonly WeeklySummarySession[],
): string {
  if (typeof summary === "string" && summary.trim().length > 0) {
    return summary.trim()
  }

  if (sessions.length === 0) {
    return "Nenhuma sessão concluída para este período."
  }

  const uniqueDays = new Set(sessions.map((session) => session.startTime.toISOString().split("T")[0])).size
  const uniqueProjects = new Set(sessions.map((session) => session.project?.name).filter(Boolean)).size
  const completedTasks = sessions.reduce((sum, session) => sum + (session.tasks?.length ?? 0), 0)

  let text = `Relatório semanal: ${sessions.length} sessões concluídas em ${uniqueDays} dia(s).`
  if (uniqueProjects > 0) {
    text += ` Projetos envolvidos: ${uniqueProjects}.`
  }
  if (completedTasks > 0) {
    text += ` Tasks vinculadas às sessões: ${completedTasks}.`
  }

  return text
}

/** The session row (with relations) mapSessionToWeeklyLog reads. */
export interface WeeklyLogSessionSource {
  id: number
  userId: number
  projectId: number | null
  startTime: Date | string
  endTime?: Date | string | null
  createdAt: Date | string
  dailyLog?: { note?: string | null } | null
  activity?: string | null
  project?: { id: number; name: string } | null
}

/** One weekly-report log entry (read-model shape, ISO strings). */
export interface WeeklyReportLogEntry {
  id: number
  userId: number
  projectId: number | null
  startTime: string
  endTime: string | null
  date: string
  note: string
  createdAt: string
  project: { id: number; name: string } | null
}

/**
 * Session -> weekly log entry (mapSessionToWeeklyLog, gateway:624-643). Note fallback chain:
 * dailyLog.note || activity || "Sessão finalizada sem observações". `date` is the END instant
 * when present, else the start instant.
 */
export function mapSessionToWeeklyLog(session: WeeklyLogSessionSource): WeeklyReportLogEntry {
  const startTime = session.startTime instanceof Date ? session.startTime : new Date(session.startTime)
  const endTime = session.endTime
    ? session.endTime instanceof Date
      ? session.endTime
      : new Date(session.endTime)
    : null
  return {
    id: session.id,
    userId: session.userId,
    projectId: session.projectId,
    startTime: startTime.toISOString(),
    endTime: endTime ? endTime.toISOString() : null,
    date: (endTime || startTime).toISOString(),
    note: session.dailyLog?.note || session.activity || "Sessão finalizada sem observações",
    createdAt: (session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt)).toISOString(),
    project: session.project
      ? {
          id: session.project.id,
          name: session.project.name,
        }
      : null,
  }
}
