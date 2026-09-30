import { createApiError, createApiResponse } from "@/lib/utils/utils"
import { ensureSelfOrPermission, requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND7-B4 (R4): DomainErrors mapeados por domainErrorResponse. EVOLUTION: "Usuário não
// encontrado" antes caía no 500 com error.message; agora NotFoundError -> 404.
const { reporting: reportingModule } = getBackendComposition()
export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const body = await request.json()
    const userId = Number(body.userId)
    const weekStart = typeof body.weekStart === "string" ? body.weekStart : ""
    const weekEnd = typeof body.weekEnd === "string" ? body.weekEnd : ""

    if (!Number.isInteger(userId) || userId <= 0 || !weekStart || !weekEnd) {
      return createApiError("userId, weekStart e weekEnd são obrigatórios", 400)
    }

    const accessError = ensureSelfOrPermission(auth.actor, userId, "MANAGE_USERS")
    if (accessError) return accessError

    const weeklyReport = await reportingModule.upsertWeeklyReport({
      userId,
      weekStart,
      weekEnd,
    })

    return createApiResponse({ weeklyReport })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao gerar relatório semanal:", error)
    const message = error instanceof Error ? error.message : "Erro ao gerar relatório semanal"
    return createApiError(message, 500)
  }
}
