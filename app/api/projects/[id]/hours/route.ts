import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND7-B4 (R4): DomainErrors mapeados por domainErrorResponse; 500 preservado p/ desconhecidos.
const { reporting: reportingModule } = getBackendComposition()
const { projectManagement: projectManagementModule } = getBackendComposition()
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const allowed = await projectManagementModule.canActorAccessProject(
      projectId,
      auth.actor.id,
      auth.actor.roles,
    )
    if (!allowed) {
      return NextResponse.json({ error: "Acesso negado ao projeto" }, { status: 403 })
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
