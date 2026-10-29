import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-5 (DEC-126) — `POST /api/projects/[id]/activities`: cria uma linha da grade.
 *
 * A tela manda o intervalo marcado (`firstMonth`/`lastMonth`), não a lista de meses: a linha é
 * contígua por decisão (DEC-126d), e os meses são derivados do intervalo na leitura. Recompensa
 * e período não são aceitos no corpo — são calculados (DEC-103), e aceitar um valor vindo da
 * tela seria a regra em duas cópias com uma delas mentindo.
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
    const activity = await projectManagementModule.createProjectActivity({
      projectId,
      actorId: auth.actor.id,
      description: body?.description,
      firstMonth: body?.firstMonth,
      lastMonth: body?.lastMonth,
      responsibleId: body?.responsibleId,
    })
    return NextResponse.json({ activity }, { status: 201 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
