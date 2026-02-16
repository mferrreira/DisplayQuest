import { NextResponse } from "next/server"
import { DailyLogRepository } from "@/backend/repositories/DailyLogRepository"
import { DailyLogService } from "@/backend/services/DailyLogService"
import { hasPermission, hasRole } from "@/lib/auth/rbac"
import { requireApiActor } from "@/lib/auth/api-guard"

const dailyLogService = new DailyLogService(new DailyLogRepository())

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const date = searchParams.get("date")
    const projectId = searchParams.get("projectId")
    const currentUser = auth.actor
    const canViewAllLogs =
      hasPermission(currentUser.roles, "MANAGE_USERS") ||
      hasRole(currentUser.roles, "LABORATORISTA")

    let logs

    if (userId) {
      if (!canViewAllLogs && Number(userId) !== currentUser.id) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
      }
      if (date) {
        logs = await dailyLogService.findByDateRange(
          Number(userId),
          new Date(date),
          new Date(date),
        )
      } else {
        logs = await dailyLogService.findByUserId(Number(userId))
      }
    } else if (projectId) {
      if (!canViewAllLogs) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
      }
      logs = await dailyLogService.findByProjectId(Number(projectId))
    } else {
      if (canViewAllLogs) {
        logs = await dailyLogService.findAll()
      } else {
        logs = await dailyLogService.findByUserId(currentUser.id)
      }
    }

    return NextResponse.json({ logs })
  } catch (error) {
    console.error("Erro ao buscar logs diários:", error)
    return NextResponse.json({ error: "Erro ao buscar logs diários" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  void request
  return NextResponse.json(
    {
      error: "Criação manual de daily log foi descontinuada. Finalize a work session para registrar o log.",
      deprecated: true,
      replacement: "PATCH /api/work-sessions/:id com status=completed e dailyLogNote",
    },
    { status: 410 },
  )
}
