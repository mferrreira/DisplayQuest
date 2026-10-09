import { NextResponse } from "next/server"
import { createApiError, createApiResponse } from "@/lib/utils/utils"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND7-B4 (R4): DomainErrors mapeados por domainErrorResponse. EVOLUTION: erros de
// upsertWeeklyReport ("Usuário não encontrado") antes caíam no 500 com error.message;
// agora NotFoundError -> 404 {error,code,details} (mensagens pinadas pelo contract OND7-B3).
// B6-3 (D4): a regra composta MANAGE_USERS||LABORATORISTA e o self-or-view desceram para os
// use cases (report-access-rules). As validações de entrada com mensagem própria ("userId
// inválido", "userId, weekStart e weekEnd são obrigatórios") ficaram na rota — ordem medida:
// elas vêm ANTES do 403 e são validação de entrada, não autorização. O 403 migrado passou a
// {error, code, details} (DEC-53) mantendo a mensagem legada "Sem permissão".
const { reporting: reportingModule } = getBackendComposition()
export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const { searchParams } = new URL(request.url)
    const userIdParam = searchParams.get("userId")
    const weekStart = searchParams.get("weekStart") || undefined
    const weekEnd = searchParams.get("weekEnd") || undefined

    let userId: number | undefined
    if (userIdParam) {
      const parsed = Number(userIdParam)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return createApiError("userId inválido", 400)
      }
      userId = parsed
    }

    const weeklyReports = await reportingModule.listWeeklyReports({
      actor,
      userId,
      weekStart,
      weekEnd,
    })

    return NextResponse.json({ weeklyReports })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar relatórios semanais:", error)
    return createApiError("Erro ao buscar relatórios semanais")
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const body = await request.json()
    const userId = Number(body.userId)
    const weekStart = typeof body.weekStart === "string" ? body.weekStart : ""
    const weekEnd = typeof body.weekEnd === "string" ? body.weekEnd : ""
    const summary = typeof body.summary === "string" ? body.summary : undefined

    if (!Number.isInteger(userId) || userId <= 0 || !weekStart || !weekEnd) {
      return createApiError("userId, weekStart e weekEnd são obrigatórios", 400)
    }

    const weeklyReport = await reportingModule.upsertWeeklyReport({
      actor,
      userId,
      weekStart,
      weekEnd,
      summary,
    })

    return createApiResponse({ weeklyReport }, 201)
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao criar relatório semanal:", error)
    const message = error instanceof Error ? error.message : "Erro ao criar relatório semanal"
    return createApiError(message, 500)
  }
}
