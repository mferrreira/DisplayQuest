import type { ProjectReportAggregateResult } from "@/backend/modules/reporting/application/contracts"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"
import { GetProjectReportUseCase } from "./get-project-report.use-case"

/**
 * OND7-B3 — frozen from aggregateProjectReport (gateway:913-971): access via
 * GetProjectReportUseCase; window = the report's stored period; daily_logs (date window,
 * date desc) + work_sessions in the window. QUIRK-7D: sessions carry NO status filter —
 * active/paused sessions enter the totals.
 */
export class AggregateProjectReportUseCase {
  constructor(
    private readonly hoursRead: HoursReadRepository,
    private readonly getProjectReport: GetProjectReportUseCase,
  ) {}

  async execute(actorUserId: number, actorRoles: string[], reportId: number): Promise<ProjectReportAggregateResult> {
    const report = await this.getProjectReport.execute(actorUserId, actorRoles, reportId)

    const windowStart = new Date(report.periodStart)
    const windowEnd = new Date(report.periodEnd)

    const [logRows, sessionRows] = await Promise.all([
      this.hoursRead.findDailyLogsInWindow({ projectId: report.projectId, gte: windowStart, lte: windowEnd }),
      this.hoursRead.findAllSessionsInWindow({ projectId: report.projectId, gte: windowStart, lte: windowEnd }),
    ])

    const totalHours = sessionRows.reduce((sum, session) => sum + (session.duration ?? 0), 0) / 3600

    return {
      report,
      logs: logRows.map((log) => ({
        id: log.id,
        userId: log.userId,
        userName: log.user?.name ?? null,
        date: log.date.toISOString(),
        startTime: log.workSession?.startTime ? log.workSession.startTime.toISOString() : null,
        endTime: log.workSession?.endTime ? log.workSession.endTime.toISOString() : null,
        note: log.note,
        projectName: log.project?.name ?? null,
      })),
      sessions: sessionRows.map((session) => ({
        id: session.id,
        userId: session.userId,
        userName: session.userName,
        startTime: session.startTime.toISOString(),
        endTime: session.endTime ? session.endTime.toISOString() : null,
        durationHours: session.duration != null ? session.duration / 3600 : null,
        activity: session.activity,
        location: session.location,
      })),
      totals: {
        logCount: logRows.length,
        sessionCount: sessionRows.length,
        totalHours,
      },
    }
  }
}
