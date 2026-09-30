import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

const { projectManagement: projectManagementModule } = getBackendComposition()

// OND5-B3 (R4): typed DomainErrors mapped by domainErrorResponse. EVOLUTION: the old
// heuristic mapped "Projeto não pode ser excluído no status atual" to 500; the DeleteProject
// use case now throws ConflictError -> 409 (pinned by the contract suite OND5-B3).

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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar projeto:", error)
    return NextResponse.json({ error: "Erro ao buscar projeto" }, { status: 500 })
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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao atualizar projeto:", error)
    return NextResponse.json({ error: "Erro ao atualizar projeto" }, { status: 500 })
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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao excluir projeto:", error)
    return NextResponse.json({ error: "Erro ao excluir projeto" }, { status: 500 })
  }
}
