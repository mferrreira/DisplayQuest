/** weekly_hours_history row + optional user include (prisma/schema.prisma :316). */
export interface WeeklyHoursHistoryRow {
  id: number
  userId: number
  userName: string
  weekStart: Date
  weekEnd: Date
  totalHours: number
  createdAt: Date
  user?: { id: number; name: string; email: string; roles: string[] } | null
}

/**
 * OND7-B3 — thin repository over `weekly_hours_history`.
 * Window semantics (QUIRK-7B: [startOfWeek, endOfWeek) with `lt`) and the orderBy switch
 * (totalHours desc when a weekStart filter is present, weekStart desc otherwise) are decided
 * by the use case; this port executes exactly what it is asked.
 */
export interface WeeklyHoursHistoryRepository {
  findMany(query: {
    userId?: number
    window?: { gte: Date; lt: Date }
    orderBy: "totalHours" | "weekStart"
  }): Promise<WeeklyHoursHistoryRow[]>
  /** Exact-instant lookup used by createWeeklyHoursHistory dedup (QUIRK-7C contrast). */
  findByWeek(userId: number, weekStart: Date): Promise<WeeklyHoursHistoryRow | null>
  create(data: {
    userId: number
    userName: string
    weekStart: Date
    weekEnd: Date
    totalHours: number
  }): Promise<WeeklyHoursHistoryRow>
}
