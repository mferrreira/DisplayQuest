import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { reporting: reportingModule } = getBackendComposition()

function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("Acesso negado")) return 403
  if (message.includes("não encontrado")) return 404
  return 500
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const reportId = Number(params.id)
    if (!/^\d+$/.test(params.id) || reportId <= 0) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    const aggregate = await reportingModule.aggregateProjectReport(auth.actor.id, auth.actor.roles, reportId)
    return NextResponse.json(aggregate)
  } catch (error: unknown) {
    console.error("Erro ao agregar relatório de projeto:", error)
    const message = error instanceof Error ? error.message : "Erro ao agregar relatório de projeto"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}
