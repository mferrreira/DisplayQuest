import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND7-B4 (R4): DomainErrors mapeados por domainErrorResponse; 500 preservado p/ desconhecidos.
// V5-2a (DEC-127): o gate `canActorAccessProject` saiu daqui. Leitura de horas do projeto é do
// autenticado — a regra mora no domínio e não consulta tabela, então consultar um gate que não
// pode responder "não" na produção só faria o teste de rota congelar o substituto, não o sistema.
const { reporting: reportingModule } = getBackendComposition()
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get("weekStart") || undefined
    const weekEnd = searchParams.get("weekEnd") || undefined

    const hours = await reportingModule.getProjectHours({
      projectId,
      weekStart,
      weekEnd,
    })

    return NextResponse.json({ hours }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor", exposeMessage: true })
  }
}
