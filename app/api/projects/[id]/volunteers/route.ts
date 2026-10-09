import { NextRequest, NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "ID do projeto inválido" }, { status: 400 })
    }

    const result = await projectManagementModule.getProjectVolunteers({
      projectId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar estatísticas dos voluntários" })
  }
}
