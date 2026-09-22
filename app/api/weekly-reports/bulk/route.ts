import { createApiError, createApiResponse } from "@/lib/utils/utils"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { isReportPeriodType } from "@/lib/constants/report-periods"

const { reporting: reportingModule } = getBackendComposition()

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const permissionError = ensurePermission(auth.actor, "MANAGE_USERS")
    if (permissionError) return permissionError

    const body = await request.json()
    const periodType = typeof body.periodType === "string" ? body.periodType : ""
    const from = typeof body.from === "string" ? body.from : ""
    const to = typeof body.to === "string" ? body.to : ""

    if (!isReportPeriodType(periodType) || !from || !to) {
      return createApiError("periodType, from e to são obrigatórios", 400)
    }

    const result = await reportingModule.bulkGenerateWeeklyReports({ periodType, from, to })

    return createApiResponse({ result })
  } catch (error: unknown) {
    console.error("Erro ao gerar relatórios em lote:", error)
    const message = error instanceof Error ? error.message : "Erro ao gerar relatórios em lote"
    return createApiError(message, 500)
  }
}