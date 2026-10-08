import { createApiError, createApiResponse } from "@/lib/utils/utils"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
import { isReportPeriodType } from "@/lib/constants/report-periods"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

// B6-3 (D4): o gate MANAGE_USERS PURO (medido: LABORATORISTA e barrado no bulk, ao contrario
// das rotas irmas) desceu para BulkGenerateWeeklyReportsUseCase, e a rota chama
// assertCanGenerateReportsInBulk ANTES de ler o corpo — o gate legado vinha antes do parse, e
// um corpo invalido para quem nao tem permissao deve seguir devolvendo 403, nao 500 (padrao
// do AssertCanPublishNotificationEventUseCase, B6-2b). bulkGenerate recheca no proprio ator.
const { reporting: reportingModule } = getBackendComposition()

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    await reportingModule.assertCanGenerateReportsInBulk({ actor })

    const body = await request.json()
    const periodType = typeof body.periodType === "string" ? body.periodType : ""
    const from = typeof body.from === "string" ? body.from : ""
    const to = typeof body.to === "string" ? body.to : ""

    if (!isReportPeriodType(periodType) || !from || !to) {
      return createApiError("periodType, from e to são obrigatórios", 400)
    }

    const result = await reportingModule.bulkGenerateWeeklyReports({ actor, periodType, from, to })

    return createApiResponse({ result })
  } catch (error: unknown) {
    // EVOLUCAO (merge 64a6095 na refatoracao): validacoes do use case viraram ValidationError
    // (mensagens verbatim) e agora respondem 400 via domainErrorResponse — antes eram 500.
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped

    console.error("Erro ao gerar relatórios em lote:", error)
    const message = error instanceof Error ? error.message : "Erro ao gerar relatórios em lote"
    return createApiError(message, 500)
  }
}
