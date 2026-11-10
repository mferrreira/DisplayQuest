import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * S05 (plan-v21, DEC-260) — `PUT /api/projects/[id]/goals/[goalId]/completion`.
 *
 * Rota fina: autentica, valida os ids, monta o ator e mapeia. O gate de gestão, o 404 da meta
 * dentro do projeto e o 400 do corpo `completed` são do use case; o `now` do servidor entra como
 * parâmetro do comando (DEC-132).
 */

function invalidId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function PUT(request: Request, context: { params: Promise<{ id: string; goalId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id, goalId } = await context.params
    const projectId = invalidId(id)
    const parsedGoalId = invalidId(goalId)
    if (projectId === null || parsedGoalId === null) {
      return NextResponse.json({ error: "Projeto ou meta inválidos" }, { status: 400 })
    }

    const body = await request.json()
    const goal = await projectManagementModule.markGoalCompletion({
      projectId,
      goalId: parsedGoalId,
      actorId: auth.actor.id,
      completed: body?.completed,
      now: new Date(),
    })
    return NextResponse.json({ goal }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
