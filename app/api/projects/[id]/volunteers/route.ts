import { NextRequest, NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar estatísticas dos voluntários:", error)
    return NextResponse.json({ error: "Erro ao buscar estatísticas dos voluntários" }, { status: 500 })
  }
}
