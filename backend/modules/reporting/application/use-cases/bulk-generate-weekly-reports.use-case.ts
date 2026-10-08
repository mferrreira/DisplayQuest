import { ValidationError } from "@/backend/domain"
import { requireActorPermission } from "@/backend/domain/identity"
import { isReportPeriod, listReportPeriods } from "@/backend/domain/reporting"
import type {
  BulkGenerateWeeklyReportsCommand,
  BulkGenerateWeeklyReportsResult,
} from "@/backend/modules/reporting/application/contracts"
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port"
import type { UpsertWeeklyReportUseCase } from "@/backend/modules/reporting/application/use-cases/upsert-weekly-report.use-case"

const MAX_BULK_PERIODS = 52

/**
 * Bulk weekly-report generation (feature 64a6095), PORTED to the clean-arch wiring during
 * the origin/dev merge: the orchestration (period loop, ISO strings, counts, messages) is
 * UNCHANGED; what changed is the seam — it now composes the SAME UpsertWeeklyReportUseCase
 * the routes use (its old-vs-new parity is already pinned in the reporting contract suite)
 * plus `directory.findActiveUsers`, and validation failures became typed ValidationError
 * (messages verbatim) so the route maps them to 400 via domainErrorResponse instead of 500.
 */
export class BulkGenerateWeeklyReportsUseCase {
  constructor(
    private readonly upsertWeeklyReport: UpsertWeeklyReportUseCase,
    private readonly directory: ReportingDirectory,
  ) {}

  async execute(command: BulkGenerateWeeklyReportsCommand): Promise<BulkGenerateWeeklyReportsResult> {
    // B6-3 (D4): MANAGE_USERS PURO (medido: LABORATORISTA é barrado no bulk, ao contrário
    // das outras rotas de weekly-reports onde ele entra pela regra composta). Gate antes de
    // qualquer validação — a rota barrava antes de ler o corpo; a validação 400
    // "periodType, from e to são obrigatórios" ficou na rota, depois do assert.
    requireActorPermission(command.actor, "MANAGE_USERS")

    if (!isReportPeriod(command.periodType)) {
      throw new ValidationError("Periodicidade inválida")
    }

    const from = new Date(command.from)
    const to = new Date(command.to)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new ValidationError("Intervalo de datas inválido")
    }
    if (to.getTime() < from.getTime()) {
      throw new ValidationError("A data final não pode ser anterior à data inicial")
    }

    const periods = listReportPeriods(command.periodType, from, to)
    if (periods.length === 0) {
      throw new ValidationError("Nenhum período encontrado no intervalo informado")
    }
    if (periods.length > MAX_BULK_PERIODS) {
      throw new ValidationError(`Limite de ${MAX_BULK_PERIODS} períodos por geração em lote excedido`)
    }

    const users = await this.directory.findActiveUsers()
    if (users.length === 0) {
      throw new ValidationError("Nenhum usuário ativo disponível para geração em lote")
    }

    const periodResults: BulkGenerateWeeklyReportsResult["periods"] = []
    let reportCount = 0

    for (const period of periods) {
      for (const user of users) {
        await this.upsertWeeklyReport.execute({
          actor: command.actor,
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
