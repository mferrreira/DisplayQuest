import { canViewWeeklyReports, requireWeeklyReportSelfOrView } from "@/backend/domain/reporting"
import type { ActorRef } from "@/backend/domain"
import type { WeeklyReportListQuery, WeeklyReportReadModel } from "@/backend/modules/reporting/application/contracts"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"
import type { WeeklyReportsRepository } from "@/backend/modules/reporting/application/ports/weekly-reports.repository"

/**
 * OND7-B3 — frozen from listWeeklyReports (gateway:39-76): list ordered by weekStart desc,
 * each report enriched with totalLogs = COUNT of completed sessions inside the report's own
 * stored window (the N+1 pattern is preserved — parity over query shape is not the contract,
 * the observable result is).
 *
 * B6-3 (D4): a RESOLUÇÃO DE ESCOPO desceu da rota. Medido: `userId` explícito exige
 * self-or-view (403 "Sem permissão"); sem filtro, quem vê todos (MANAGE_USERS||LABORATORISTA)
 * lista tudo e o usuário comum é restrito às próprias linhas. A validação 400 "userId
 * inválido" continua na rota (ordem medida: 400 antes do 403; é validação de entrada).
 */
export class ListWeeklyReportsUseCase {
  constructor(
    private readonly weeklyReports: WeeklyReportsRepository,
    private readonly hoursRead: HoursReadRepository,
  ) {}

  async execute(query: WeeklyReportListQuery): Promise<WeeklyReportReadModel[]> {
    let userId = query.userId
    if (userId !== undefined) {
      requireWeeklyReportSelfOrView(query.actor, userId)
    } else if (!canViewWeeklyReports(query.actor)) {
      userId = query.actor.kind === "user" ? query.actor.id : undefined
    }

    const reports = await this.weeklyReports.findMany({
      userId,
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
