import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-2c (DEC-61/63) — entregáveis do projeto: `GET` lista, `POST` cria.
 *
 * A rota é fina (padrão D4): autentica, valida o id, monta o ator e mapeia. Nome, quantidade
 * e os 400 são do domínio; 404/403 são dos use cases.
 */

function invalidProject() {
  return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const projectId = Number((await context.params).id)
    if (!Number.isInteger(projectId) || projectId <= 0) return invalidProject()

    const deliverables = await projectManagementModule.listProjectDeliverables({
      projectId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })
    return NextResponse.json({ deliverables }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const projectId = Number((await context.params).id)
    if (!Number.isInteger(projectId) || projectId <= 0) return invalidProject()

    const body = await request.json()
    const deliverable = await projectManagementModule.createProjectDeliverable({
      projectId,
      actorId: auth.actor.id,
      name: body?.name,
      quantity: body?.quantity,
    })
    return NextResponse.json({ deliverable }, { status: 201 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
