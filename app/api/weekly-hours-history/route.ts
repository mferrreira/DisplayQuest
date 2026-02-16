import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { createReportingModule } from "@/backend/modules/reporting"

const reportingModule = createReportingModule()

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const accessError = ensurePermission(
      auth.actor,
      "MANAGE_USERS",
      "Apenas coordenadores e gerentes podem acessar.",
    )
    if (accessError) return accessError

    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get("weekStart") || undefined
    const userIdParam = searchParams.get("userId")
    const stats = searchParams.get("stats")

    if (stats === "true") {
      const weeklyStats = await reportingModule.getWeeklyHoursStats()
      return NextResponse.json({ stats: weeklyStats })
    }

    const userId = userIdParam ? Number(userIdParam) : undefined
    if (userIdParam && (!Number.isInteger(userId) || (userId as number) <= 0)) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 })
    }

    const history = await reportingModule.listWeeklyHoursHistory({
      weekStart,
      userId,
    })

    return NextResponse.json({ history })
  } catch (error: unknown) {
    console.error("Erro na API de histórico de horas semanais:", error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const accessError = ensurePermission(
      auth.actor,
      "MANAGE_USERS",
      "Apenas coordenadores e gerentes podem acessar.",
    )
    if (accessError) return accessError

    const body = await request.json()
    const action = body.action

    if (action === "reset") {
      const results = await reportingModule.resetWeeklyHoursHistory()
      return NextResponse.json({
        message: "Horas semanais resetadas com sucesso",
        results,
      })
    }

    if (action === "create_week_history") {
      const weekStart = typeof body.weekStart === "string" ? body.weekStart : ""
      if (!weekStart) {
        return NextResponse.json({ error: "weekStart é obrigatório" }, { status: 400 })
      }

      const results = await reportingModule.createWeeklyHoursHistory(weekStart)
      return NextResponse.json({
        message: "Histórico semanal criado com sucesso",
        results,
      })
    }

    return NextResponse.json({ error: "Ação não reconhecida" }, { status: 400 })
  } catch (error: unknown) {
    console.error("Erro na API de histórico de horas semanais:", error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
