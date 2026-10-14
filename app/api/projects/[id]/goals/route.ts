import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-5 (DEC-156) — `POST /api/projects/[id]/goals`: cria uma meta do projeto.
 *
 * A leitura das metas não tem rota própria: ela vem no `GET /cronograma` (a aba é uma tabela só).
 * Texto, número opcional e os 400 são do domínio; 404 e 403 são do use case, e o 403 vem antes
 * dos 400 porque o gate é a primeira coisa que o use case faz.
 */

function invalidProject() {
  return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const projectId = Number((await context.params).id)
    if (!Number.isInteger(projectId) || projectId <= 0) return invalidProject()

    const body = await request.json()
    const goal = await projectManagementModule.createProjectGoal({
      projectId,
      actorId: auth.actor.id,
      description: body?.description,
      target: body?.target,
    })
    return NextResponse.json({ goal }, { status: 201 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
