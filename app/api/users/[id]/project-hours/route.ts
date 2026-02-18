import { NextResponse } from "next/server"
import { ensureSelfOrPermission, requireApiActor } from "@/lib/auth/api-guard"
import { createReportingModule } from "@/backend/modules/reporting"

const reportingModule = createReportingModule()

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const targetUserId = Number(params.id)
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const accessError = ensureSelfOrPermission(auth.actor, targetUserId, "MANAGE_USERS")
    if (accessError) return accessError

    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get("weekStart") || undefined
    const weekEnd = searchParams.get("weekEnd") || undefined

    const hours = await reportingModule.getUserProjectHours({
      userId: targetUserId,
      weekStart,
      weekEnd,
    })

    return NextResponse.json({ hours }, { status: 200 })
  } catch (error: unknown) {
    console.error("Erro na API de horas dos projetos do usuário:", error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
