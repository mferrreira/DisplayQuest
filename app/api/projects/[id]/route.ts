import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()
function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("não encontrado")) return 404
  if (message.includes("Acesso negado") || message.includes("permissão")) return 403
  if (message.includes("Dados inválidos") || message.includes("inválido")) return 400
  return 500
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const project = await projectManagementModule.getProjectForActor({
      projectId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })

    return NextResponse.json({ project }, { status: 200 })
  } catch (error: unknown) {
    console.error("Erro ao buscar projeto:", error)
    const message = error instanceof Error ? error.message : "Erro ao buscar projeto"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const body = await request.json()
    const project = await projectManagementModule.updateProject({
      projectId,
      actorId: auth.actor.id,
      data: body,
    })

    return NextResponse.json({ project }, { status: 200 })
  } catch (error: unknown) {
    console.error("Erro ao atualizar projeto:", error)
    const message = error instanceof Error ? error.message : "Erro ao atualizar projeto"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    await projectManagementModule.deleteProject({
      projectId,
      actorId: auth.actor.id,
    })

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: unknown) {
    console.error("Erro ao excluir projeto:", error)
    const message = error instanceof Error ? error.message : "Erro ao excluir projeto"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}
