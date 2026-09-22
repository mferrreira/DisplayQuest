import type {
  BulkGenerateWeeklyReportsCommand,
  BulkGenerateWeeklyReportsResult,
} from "@/backend/modules/reporting/application/contracts"
import type { ReportingGateway } from "@/backend/modules/reporting/application/ports/reporting.gateway"
import {
  isReportPeriodType,
  listPeriods,
} from "@/lib/constants/report-periods"

const MAX_BULK_PERIODS = 52

export class BulkGenerateWeeklyReportsUseCase {
  constructor(private readonly gateway: ReportingGateway) {}

  async execute(command: BulkGenerateWeeklyReportsCommand): Promise<BulkGenerateWeeklyReportsResult> {
    if (!isReportPeriodType(command.periodType)) {
      throw new Error("Periodicidade inválida")
    }

    const from = new Date(command.from)
    const to = new Date(command.to)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new Error("Intervalo de datas inválido")
    }
    if (to.getTime() < from.getTime()) {
      throw new Error("A data final não pode ser anterior à data inicial")
    }

    const periods = listPeriods(command.periodType, from, to)
    if (periods.length === 0) {
      throw new Error("Nenhum período encontrado no intervalo informado")
    }
    if (periods.length > MAX_BULK_PERIODS) {
      throw new Error(`Limite de ${MAX_BULK_PERIODS} períodos por geração em lote excedido`)
    }

    const users = await this.gateway.findActiveUsers()
    if (users.length === 0) {
      throw new Error("Nenhum usuário ativo disponível para geração em lote")
    }

    const periodResults: BulkGenerateWeeklyReportsResult["periods"] = []
    let reportCount = 0

    for (const period of periods) {
      for (const user of users) {
        await this.gateway.upsertWeeklyReport({
          userId: user.id,
          weekStart: period.start.toISOString(),
          weekEnd: period.end.toISOString(),
        })
        reportCount += 1
      }
      periodResults.push({
        label: period.label,
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        reports: users.length,
      })
    }

    return {
      periodCount: periods.length,
      reportCount,
      periods: periodResults,
    }
  }
}