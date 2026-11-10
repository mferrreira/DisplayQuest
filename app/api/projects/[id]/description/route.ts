import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * S06 (plan-v21, R9/DEC-261) — `PUT /api/projects/[id]/description`.
 *
 * Rota fina dedicada à descrição: o gate R9 (gestão da ACL OU membro ATIVO) e os 400 da
 * regra de descrição são do use case; a escrita completa do wizard continua na PUT do projeto.
 */

function invalidProject() {
  return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const projectId = Number((await context.params).id)
    if (!Number.isInteger(projectId) || projectId <= 0) return invalidProject()

    const body = await request.json()
    const project = await projectManagementModule.updateProjectDescription({
      projectId,
      actorId: auth.actor.id,
      description: body?.description,
    })
    return NextResponse.json({ project }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
