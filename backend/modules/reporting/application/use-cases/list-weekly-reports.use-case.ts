import type { WeeklyReportListQuery, WeeklyReportReadModel } from "@/backend/modules/reporting/application/contracts"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"
import type { WeeklyReportsRepository } from "@/backend/modules/reporting/application/ports/weekly-reports.repository"

/**
 * OND7-B3 — frozen from listWeeklyReports (gateway:39-76): list ordered by weekStart desc,
 * each report enriched with totalLogs = COUNT of completed sessions inside the report's own
 * stored window (the N+1 pattern is preserved — parity over query shape is not the contract,
 * the observable result is).
 */
export class ListWeeklyReportsUseCase {
  constructor(
    private readonly weeklyReports: WeeklyReportsRepository,
    private readonly hoursRead: HoursReadRepository,
  ) {}

  async execute(query: WeeklyReportListQuery): Promise<WeeklyReportReadModel[]> {
    const reports = await this.weeklyReports.findMany({
      userId: query.userId,
      weekStartGte: query.weekStart ? new Date(query.weekStart) : undefined,
      weekEndLte: query.weekEnd ? new Date(query.weekEnd) : undefined,
    })

    const enriched = await Promise.all(
      reports.map(async (report) => {
        const totalLogs = await this.hoursRead.countCompleted({
          userId: report.userId,
          gte: report.weekStart,
          lte: report.weekEnd,
        })

        return {
          id: report.id,
          userId: report.userId,
          userName: report.userName,
          weekStart: report.weekStart.toISOString(),
          weekEnd: report.weekEnd.toISOString(),
          totalLogs,
          summary: report.summary,
          createdAt: report.createdAt.toISOString(),
        } satisfies WeeklyReportReadModel
      }),
    )

    return enriched
  }
}
