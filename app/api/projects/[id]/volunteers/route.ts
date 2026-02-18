import { NextRequest, NextResponse } from "next/server"
import { createProjectManagementModule } from "@/backend/modules/project-management"
import { requireApiActor } from "@/lib/auth/api-guard"

const projectManagementModule = createProjectManagementModule()

function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("não encontrado")) return 404
  if (message.includes("Acesso negado") || message.includes("permissão")) return 403
  if (message.includes("inválido")) return 400
  return 500
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "ID do projeto inválido" }, { status: 400 })
    }

    const result = await projectManagementModule.getProjectVolunteers({
      projectId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error: unknown) {
    console.error("Erro ao buscar estatísticas dos voluntários:", error)
    const message = error instanceof Error ? error.message : "Erro ao buscar estatísticas dos voluntários"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}
