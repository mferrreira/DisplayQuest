import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

// OND7-B4 (R4): DomainErrors mapeados por domainErrorResponse — mesmos status do
// toHttpStatus por mensagem anterior (403/404), agora tipados (contract OND7-B3).
const { reporting: reportingModule } = getBackendComposition()

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
    return routeErrorResponse(error, { fallback: "Erro ao agregar relatório de projeto", exposeMessage: true })
  }
}
