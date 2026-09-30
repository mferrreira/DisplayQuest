import { averageHoursPerWeek, formatWeekDate, historyWeekCount, rollingWeekWindows } from "@/backend/domain/reporting"
import { aggregateProjectHours } from "@/backend/domain/reporting"
import type { ProjectHoursHistoryQuery } from "@/backend/modules/reporting/application/contracts"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"

/**
 * OND7-B3 — frozen from getProjectHoursHistory (gateway:200-233): `months||4` weeks*4
 * (months=0 falls to the default), rolling Monday-normalized windows over subWeeks(now, i),
 * dd/MM/yyyy labels, summed totalHours and averageHoursPerWeek.
 */
export class GetProjectHoursHistoryUseCase {
  constructor(private readonly hoursRead: HoursReadRepository) {}

  async execute(query: ProjectHoursHistoryQuery): Promise<{
    projectId: number
    weeks: Array<{
      weekStart: string
      weekEnd: string
      totalHours: number
      sessionCount: number
      hoursByUser: Array<{
        userId: number
        userName: string | null
        totalHours: number
        sessions: unknown[]
      }>
    }>
    totalHours: number
    averageHoursPerWeek: number
  }> {
    const windows = rollingWeekWindows(new Date(), historyWeekCount(query.months))

    const weeks = []
    for (const window of windows) {
      const sessions = await this.hoursRead.findCompletedWithRelations({
        projectId: query.projectId,
        gte: window.start,
        lte: window.end,
      })
      const weekData = aggregateProjectHours(query.projectId, sessions)

      weeks.push({
        weekStart: formatWeekDate(window.start),
        weekEnd: formatWeekDate(window.end),
        totalHours: weekData.totalHours,
        sessionCount: weekData.sessionCount,
        hoursByUser: weekData.hoursByUser,
      })
    }

    const totalHours = weeks.reduce((sum, week) => sum + week.totalHours, 0)

    return {
      projectId: query.projectId,
      weeks,
      totalHours,
      averageHoursPerWeek: averageHoursPerWeek(totalHours, weeks.length),
    }
  }
}
