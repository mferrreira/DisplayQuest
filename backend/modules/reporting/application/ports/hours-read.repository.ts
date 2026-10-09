import type { HoursSessionRow } from "@/backend/domain/reporting";

/**
 * OND7-B3 — thin read-only repository over `work_sessions` + `daily_logs` for the hours
 * aggregates. NO rules here: window selection (QUIRK-7A partial ranges, QUIRK-7D no-status)
 * is decided by the use cases; this port only executes exactly what it is asked.
 */
/** Completed session row + the relations the weekly-log mapping reads (frozen include). */
export interface CompletedSessionRow extends HoursSessionRow {
  projectId: number | null
  createdAt: Date
  user?: { id: number; name: string; email: string } | null
  dailyLog?: { id: number; note: string | null; date: Date } | null
  project?: { id: number; name: string } | null
}

export interface SessionDurationRow {
  duration: number | null
}

export interface AggregateSessionRow {
  id: number
  userId: number
  userName: string
  startTime: Date
  endTime: Date | null
  duration: number | null
  activity: string | null
  location: string | null
}

export interface AggregateDailyLogRow {
  id: number
  userId: number
  note: string | null
  date: Date
  user: { name: string } | null
  project: { name: string } | null
  workSession: { startTime: Date; endTime: Date | null } | null
}

export interface HoursReadRepository {
  countCompleted(query: {
    userId?: number
    projectId?: number
    gte?: Date
    lte?: Date
  }): Promise<number>
  /** status:"completed" + relations (user/project/dailyLog/tasks), orderBy startTime desc. */
  findCompletedWithRelations(query: {
    userId?: number
    projectId?: number
    gte?: Date
    lte?: Date
  }): Promise<CompletedSessionRow[]>
  /** status:"completed" durations only (reset/create weekly hours). */
  findCompletedDurations(query: { userId: number; gte: Date; lte: Date }): Promise<SessionDurationRow[]>
  /** NO status filter — QUIRK-7D frozen (aggregateProjectReport counts active/paused too). */
  findAllSessionsInWindow(query: { projectId: number; gte: Date; lte: Date }): Promise<AggregateSessionRow[]>
  /** daily_logs in window, orderBy date desc, with user/project/workSession relations. */
  findDailyLogsInWindow(query: { projectId: number; gte: Date; lte: Date }): Promise<AggregateDailyLogRow[]>
}
