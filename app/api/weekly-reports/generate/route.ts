import { createApiError, createApiResponse } from "@/lib/utils/utils"
import { ensureSelfOrPermission, requireApiActor } from "@/lib/auth/api-guard"
import { createReportingModule } from "@/backend/modules/reporting"

const reportingModule = createReportingModule()

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
    console.error("Erro ao gerar relatório semanal:", error)
    const message = error instanceof Error ? error.message : "Erro ao gerar relatório semanal"
    return createApiError(message, 500)
  }
}
