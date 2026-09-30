import { NotFoundError, ValidationError } from "@/backend/domain/errors"
import { buildWeeklySummary, mapSessionToWeeklyLog, normalizeLocalWeekWindow } from "@/backend/domain/reporting"
import type { UpsertWeeklyReportCommand, WeeklyReportReadModel, WeeklyReportSessionLog } from "@/backend/modules/reporting/application/contracts"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port"
import type { WeeklyReportsRepository } from "@/backend/modules/reporting/application/ports/weekly-reports.repository"

/**
 * OND7-B3 — frozen from upsertWeeklyReport (gateway:108-173) + the userId validation the
 * previous thin use case already enforced in production ("Usuário inválido").
 * QUIRK-7I: window normalized with LOCAL setHours; "existing" matched by EXACT instant
 * equality of the normalized pair (same-local-day raw instants collapse).
 */
export class UpsertWeeklyReportUseCase {
  constructor(
    private readonly weeklyReports: WeeklyReportsRepository,
    private readonly hoursRead: HoursReadRepository,
    private readonly directory: ReportingDirectory,
  ) {}

  async execute(command: UpsertWeeklyReportCommand): Promise<WeeklyReportReadModel> {
    if (!Number.isInteger(command.userId) || command.userId <= 0) {
      throw new ValidationError("Usuário inválido")
    }

    const user = await this.directory.findUserById(command.userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const { start: weekStart, end: weekEnd } = normalizeLocalWeekWindow(
      new Date(command.weekStart),
      new Date(command.weekEnd),
    )

    const sessions = await this.hoursRead.findCompletedWithRelations({
      userId: user.id,
      gte: weekStart,
      lte: weekEnd,
    })

    const totalLogs = sessions.length
    const summary = buildWeeklySummary(command.summary, sessions)

    const existing = await this.weeklyReports.findFirstByWindow(user.id, weekStart, weekEnd)

    const report = existing
      ? await this.weeklyReports.update(existing.id, {
          userName: user.name,
          totalLogs,
          summary,
        })
      : await this.weeklyReports.create({
          userId: user.id,
          userName: user.name,
          weekStart,
          weekEnd,
          totalLogs,
          summary,
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
