import { mapSessionToWeeklyLog, requireWeeklyReportSelfOrView } from "@/backend/domain/reporting"
import type { ActorRef } from "@/backend/domain"
import type { WeeklyReportReadModel, WeeklyReportSessionLog } from "@/backend/modules/reporting/application/contracts"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"
import type { WeeklyReportsRepository } from "@/backend/modules/reporting/application/ports/weekly-reports.repository"

/** OND7-B3 — frozen from getWeeklyReportById (gateway:78-106): null when missing; logs =
 * completed sessions in the stored window mapped by the pure rule.
 *
 * B6-3 (D4): self-or-view depois da leitura — a ordem medida na rota é 404 ANTES do 403
 * (a busca vem primeiro; o dono decide depois). Devolve `null` no 404 para a rota preservar
 * o corpo legado { error: "Relatório não encontrado" }. */
export class GetWeeklyReportByIdUseCase {
  constructor(
    private readonly weeklyReports: WeeklyReportsRepository,
    private readonly hoursRead: HoursReadRepository,
  ) {}

  async execute(actor: ActorRef, id: number): Promise<WeeklyReportReadModel | null> {
    const report = await this.weeklyReports.findById(id)
    if (!report) {
      return null
    }
    requireWeeklyReportSelfOrView(actor, report.userId)

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
