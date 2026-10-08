import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND7-B4 (R4): DomainErrors mapeados por domainErrorResponse (400/404); não-DomainError
// mantém o 500 com error.message como antes.
// B6-3 (D4): o gate MANAGE_USERS PURO com a mensagem própria ("Apenas coordenadores e
// gerentes podem acessar.") mora nos use cases de historico/estatisticas. O POST chama
// assertCanManageWeeklyHours ANTES de ler o corpo (o gate legado vinha antes do parse;
// padrao B6-2b/2d). O cron semanal passa o systemActor de reason WEEKLY_RESET no mesmo
// use case de reset — DEC-54 (o guarda system-callers.test.ts vigia as rotas).
const { reporting: reportingModule } = getBackendComposition()
export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)

    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get("weekStart") || undefined
    const userIdParam = searchParams.get("userId")
    const stats = searchParams.get("stats")

    if (stats === "true") {
      const weeklyStats = await reportingModule.getWeeklyHoursStats(actor)
      return NextResponse.json({ stats: weeklyStats })
    }

    const userId = userIdParam ? Number(userIdParam) : undefined
    if (userIdParam && (!Number.isInteger(userId) || (userId as number) <= 0)) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 })
    }

    const history = await reportingModule.listWeeklyHoursHistory({
      actor,
      weekStart,
      userId,
    })

    return NextResponse.json({ history })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro na API de histórico de horas semanais:", error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    await reportingModule.assertCanManageWeeklyHours({ actor })

    const body = await request.json()
    const action = body.action

    if (action === "reset") {
      const results = await reportingModule.resetWeeklyHoursHistory(actor)
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

      const results = await reportingModule.createWeeklyHoursHistory(actor, weekStart)
      return NextResponse.json({
        message: "Histórico semanal criado com sucesso",
        results,
      })
    }

    return NextResponse.json({ error: "Ação não reconhecida" }, { status: 400 })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro na API de histórico de horas semanais:", error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
