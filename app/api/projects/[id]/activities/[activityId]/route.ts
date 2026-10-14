import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-5 — `PATCH` e `DELETE /api/projects/[id]/activities/[activityId]`.
 *
 * `PATCH` aceita descrição, responsável e meses (mesclados com os gravados, para a tela poder
 * estender o fim mandando só `lastMonth`). `status` não é aceito aqui: abrir, solicitar conclusão
 * e concluir são o fluxo de duas fases do V5-7 (DEC-76), com gate e prêmio próprios.
 */

function invalidId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; activityId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id, activityId } = await context.params
    const projectId = invalidId(id)
    const parsedActivityId = invalidId(activityId)
    if (projectId === null || parsedActivityId === null) {
      return NextResponse.json({ error: "Projeto ou atividade inválidos" }, { status: 400 })
    }

    const body = await request.json()
    const activity = await projectManagementModule.updateProjectActivity({
      projectId,
      activityId: parsedActivityId,
      actorId: auth.actor.id,
      description: body?.description,
      firstMonth: body?.firstMonth,
      lastMonth: body?.lastMonth,
      responsibleId: body?.responsibleId,
    })
    return NextResponse.json({ activity }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; activityId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id, activityId } = await context.params
    const projectId = invalidId(id)
    const parsedActivityId = invalidId(activityId)
    if (projectId === null || parsedActivityId === null) {
      return NextResponse.json({ error: "Projeto ou atividade inválidos" }, { status: 400 })
    }

    const result = await projectManagementModule.deleteProjectActivity({
      projectId,
      activityId: parsedActivityId,
      actorId: auth.actor.id,
    })
    return NextResponse.json(result, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
