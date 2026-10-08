import { NextRequest } from "next/server"
import { createApiError, createApiResponse } from "@/lib/utils/utils"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND7-B4 (R4): DomainErrors (ex.: P2025 do delete) mapeados por domainErrorResponse.
// B6-3 (D4): self-or-view desceu para os use cases (404 antes do 403, ordem medida). O GET
// preserva o 404 legado {error} (null do use case). No DELETE o pre-check de existência da
// rota desceu junto com o gate, e o 404 de ausência passou ao NotFoundError mapeado
// ({error, code, details}) — mesma evolução documentada de purchases/[id] (B5) e do PATCH
// (B6-2d); o QUIRK-7K (P2025 na corrida fetch->delete) segue 500 legado.
const { reporting: reportingModule } = getBackendComposition()
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return createApiError("ID inválido", 400)
    }

    const report = await reportingModule.getWeeklyReportById(actor, id)
    if (!report) {
      return createApiError("Relatório não encontrado", 404)
    }

    return createApiResponse({ weeklyReport: report })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar relatório semanal:", error)
    return createApiError("Erro interno do servidor", 500)
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return createApiError("ID inválido", 400)
    }

    await reportingModule.deleteWeeklyReport(actor, id)
    return createApiResponse({ success: true })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao deletar relatório semanal:", error)
    return createApiError("Erro ao deletar relatório semanal", 500)
  }
}
