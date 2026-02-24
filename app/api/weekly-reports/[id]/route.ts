import { NextRequest } from "next/server"
import { createApiError, createApiResponse } from "@/lib/utils/utils"
import { requireApiActor } from "@/lib/auth/api-guard"
import { hasPermission, hasRole } from "@/lib/auth/rbac"
import { getBackendComposition } from "@/backend/composition/root"
const { reporting: reportingModule } = getBackendComposition()
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return createApiError("ID inválido", 400)
    }

    const report = await reportingModule.getWeeklyReportById(id)
    if (!report) {
      return createApiError("Relatório não encontrado", 404)
    }

    const actor = auth.actor
    const canViewAllReports =
      hasPermission(actor.roles, "MANAGE_USERS") ||
      hasRole(actor.roles, "LABORATORISTA")

    if (!canViewAllReports && actor.id !== report.userId) {
      return createApiError("Sem permissão", 403)
    }

    return createApiResponse({ weeklyReport: report })
  } catch (error) {
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

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return createApiError("ID inválido", 400)
    }

    const report = await reportingModule.getWeeklyReportById(id)
    if (!report) {
      return createApiError("Relatório não encontrado", 404)
    }

    const actor = auth.actor
    const canManageReports =
      hasPermission(actor.roles, "MANAGE_USERS") ||
      hasRole(actor.roles, "LABORATORISTA")

    if (!canManageReports && actor.id !== report.userId) {
      return createApiError("Sem permissão", 403)
    }

    await reportingModule.deleteWeeklyReport(id)
    return createApiResponse({ success: true })
  } catch (error) {
    console.error("Erro ao deletar relatório semanal:", error)
    return createApiError("Erro ao deletar relatório semanal", 500)
  }
}
