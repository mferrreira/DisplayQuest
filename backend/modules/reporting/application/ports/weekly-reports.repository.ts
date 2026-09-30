/** weekly_reports row (prisma/schema.prisma :183). */
export interface WeeklyReportRow {
  id: number
  userId: number
  userName: string
  weekStart: Date
  weekEnd: Date
  totalLogs: number
  summary: string | null
  createdAt: Date
}

/**
 * OND7-B3 — thin repository over `weekly_reports` (R1: table-level CRUD only, no rules).
 * The legacy gateway's window-matching semantics (QUIRK-7I: EXACT instant equality for the
 * upsert lookup) are preserved by `findFirstByWindow`.
 */
export interface WeeklyReportsRepository {
  findMany(query: {
    userId?: number
    weekStartGte?: Date
    weekEndLte?: Date
  }): Promise<WeeklyReportRow[]>
  findById(id: number): Promise<WeeklyReportRow | null>
  /** Exact-match lookup used by upsertWeeklyReport (QUIRK-7I). */
  findFirstByWindow(userId: number, weekStart: Date, weekEnd: Date): Promise<{ id: number } | null>
  create(data: {
    userId: number
    userName: string
    weekStart: Date
    weekEnd: Date
    totalLogs: number
    summary: string | null
  }): Promise<WeeklyReportRow>
  update(id: number, data: { userName: string; totalLogs: number; summary: string }): Promise<WeeklyReportRow>
  /** No existence pre-check: a missing id propagates Prisma P2025 (QUIRK-7K, frozen). */
  delete(id: number): Promise<void>
}
