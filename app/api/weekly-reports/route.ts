import { NextResponse } from "next/server"
import { createApiError, createApiResponse } from "@/lib/utils/utils"
import { requireApiActor } from "@/lib/auth/api-guard"
import { hasPermission, hasRole } from "@/lib/auth/rbac"
import { getBackendComposition } from "@/backend/composition/root"
const { reporting: reportingModule } = getBackendComposition()
export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = auth.actor
    const { searchParams } = new URL(request.url)
    const userIdParam = searchParams.get("userId")
    const weekStart = searchParams.get("weekStart") || undefined
    const weekEnd = searchParams.get("weekEnd") || undefined

    const canViewAllReports =
      hasPermission(actor.roles, "MANAGE_USERS") ||
      hasRole(actor.roles, "LABORATORISTA")

    let userId: number | undefined
    if (userIdParam) {
      const parsed = Number(userIdParam)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return createApiError("userId inválido", 400)
      }
      if (!canViewAllReports && parsed !== actor.id) {
        return createApiError("Sem permissão", 403)
      }
      userId = parsed
    } else if (!canViewAllReports) {
      userId = actor.id
    }

    const weeklyReports = await reportingModule.listWeeklyReports({
      userId,
      weekStart,
      weekEnd,
    })

    return NextResponse.json({ weeklyReports })
  } catch (error) {
    console.error("Erro ao buscar relatórios semanais:", error)
    return createApiError("Erro ao buscar relatórios semanais")
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = auth.actor
    const body = await request.json()
    const userId = Number(body.userId)
    const weekStart = typeof body.weekStart === "string" ? body.weekStart : ""
    const weekEnd = typeof body.weekEnd === "string" ? body.weekEnd : ""
    const summary = typeof body.summary === "string" ? body.summary : undefined

    if (!Number.isInteger(userId) || userId <= 0 || !weekStart || !weekEnd) {
      return createApiError("userId, weekStart e weekEnd são obrigatórios", 400)
    }

    const canCreateForOthers =
      hasPermission(actor.roles, "MANAGE_USERS") ||
      hasRole(actor.roles, "LABORATORISTA")

    if (!canCreateForOthers && actor.id !== userId) {
      return createApiError("Sem permissão", 403)
    }

    const weeklyReport = await reportingModule.upsertWeeklyReport({
      userId,
      weekStart,
      weekEnd,
      summary,
    })

    return createApiResponse({ weeklyReport }, 201)
  } catch (error: unknown) {
    console.error("Erro ao criar relatório semanal:", error)
    const message = error instanceof Error ? error.message : "Erro ao criar relatório semanal"
    return createApiError(message, 500)
  }
}
