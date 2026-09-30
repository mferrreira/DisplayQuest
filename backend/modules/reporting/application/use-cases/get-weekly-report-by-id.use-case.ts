import { mapSessionToWeeklyLog } from "@/backend/domain/reporting"
import type { WeeklyReportReadModel, WeeklyReportSessionLog } from "@/backend/modules/reporting/application/contracts"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"
import type { WeeklyReportsRepository } from "@/backend/modules/reporting/application/ports/weekly-reports.repository"

/** OND7-B3 — frozen from getWeeklyReportById (gateway:78-106): null when missing; logs =
 * completed sessions in the stored window mapped by the pure rule. */
export class GetWeeklyReportByIdUseCase {
  constructor(
    private readonly weeklyReports: WeeklyReportsRepository,
    private readonly hoursRead: HoursReadRepository,
  ) {}

  async execute(id: number): Promise<WeeklyReportReadModel | null> {
    const report = await this.weeklyReports.findById(id)
    if (!report) {
      return null
    }

    const sessions = await this.hoursRead.findCompletedWithRelations({
      userId: report.userId,
      gte: report.weekStart,
      lte: report.weekEnd,
    })

    const logs: WeeklyReportSessionLog[] = sessions.map((session) => mapSessionToWeeklyLog(session))

    return {
      id: report.id,
      userId: report.userId,
      userName: report.userName,
      weekStart: report.weekStart.toISOString(),
      weekEnd: report.weekEnd.toISOString(),
      totalLogs: logs.length,
      summary: report.summary,
      createdAt: report.createdAt.toISOString(),
      logs,
    }
  }
}
