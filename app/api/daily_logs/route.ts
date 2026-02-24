import { NextResponse } from "next/server"
import { hasPermission, hasRole } from "@/lib/auth/rbac"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { workExecution: workExecutionModule } = getBackendComposition()
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
      logs = await workExecutionModule.listDailyLogs({
        userId: Number(userId),
        date: date || undefined,
      })
    } else if (projectId) {
      if (!canViewAllLogs) {
        return NextResponse.json({ error: "Acesso negado." }, { status: 403 })
      }
      logs = await workExecutionModule.listDailyLogs({
        projectId: Number(projectId),
      })
    } else {
      if (canViewAllLogs) {
        logs = await workExecutionModule.listDailyLogs({})
      } else {
        logs = await workExecutionModule.listDailyLogs({
          userId: currentUser.id,
        })
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
