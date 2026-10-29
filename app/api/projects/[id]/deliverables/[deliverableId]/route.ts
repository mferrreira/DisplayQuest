import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-2c — um entregável: `PUT` atualiza (corpo parcial é aceito), `DELETE` apaga.
 * O id do entregável é procurado dentro do projeto pelo use case: id de outro projeto
 * responde 404, não "achei e editei".
 */

function parseIds(context: { params: Promise<{ id: string; deliverableId: string }> }) {
  return context.params.then((params) => {
    const projectId = Number(params.id)
    const deliverableId = Number(params.deliverableId)
    const valid =
      Number.isInteger(projectId) && projectId > 0 && Number.isInteger(deliverableId) && deliverableId > 0
    return { projectId, deliverableId, valid }
  })
}

export async function PUT(request: Request, context: { params: Promise<{ id: string; deliverableId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { projectId, deliverableId, valid } = await parseIds(context)
    if (!valid) {
      return NextResponse.json({ error: "Projeto ou entregável inválido" }, { status: 400 })
    }

    const body = await request.json()
    const deliverable = await projectManagementModule.updateProjectDeliverable({
      projectId,
      deliverableId,
      actorId: auth.actor.id,
      name: body?.name,
      quantity: body?.quantity,
    })
    return NextResponse.json({ deliverable }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; deliverableId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { projectId, deliverableId, valid } = await parseIds(context)
    if (!valid) {
      return NextResponse.json({ error: "Projeto ou entregável inválido" }, { status: 400 })
    }

    const result = await projectManagementModule.deleteProjectDeliverable({
      projectId,
      deliverableId,
      actorId: auth.actor.id,
    })
    return NextResponse.json({ deliverable: result }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
