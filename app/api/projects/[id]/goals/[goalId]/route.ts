import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-5 — `PATCH` e `DELETE /api/projects/[id]/goals/[goalId]`.
 *
 * `PATCH` é corpo parcial: chave ausente não apaga (DEC-149, medido no vínculo). `target: null`
 * apaga o número; `target` ausente deixa como está.
 */

function invalidId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; goalId: string }> }) {
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
    const goal = await projectManagementModule.updateProjectGoal({
      projectId,
      goalId: parsedGoalId,
      actorId: auth.actor.id,
      description: body?.description,
      target: body?.target,
    })
    return NextResponse.json({ goal }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; goalId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id, goalId } = await context.params
    const projectId = invalidId(id)
    const parsedGoalId = invalidId(goalId)
    if (projectId === null || parsedGoalId === null) {
      return NextResponse.json({ error: "Projeto ou meta inválidos" }, { status: 400 })
    }

    const result = await projectManagementModule.deleteProjectGoal({
      projectId,
      goalId: parsedGoalId,
      actorId: auth.actor.id,
    })
    return NextResponse.json(result, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
