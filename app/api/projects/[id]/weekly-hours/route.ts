import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
const { reporting: reportingModule } = getBackendComposition()
const { projectManagement: projectManagementModule } = getBackendComposition()
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get("weekStart")

    if (!weekStart) {
      return NextResponse.json({ error: "weekStart é obrigatório" }, { status: 400 })
    }

    const allowed = await projectManagementModule.canActorAccessProject(
      projectId,
      auth.actor.id,
      auth.actor.roles,
    )
    if (!allowed) {
      return NextResponse.json({ error: "Acesso negado ao projeto" }, { status: 403 })
    }

    const hours = await reportingModule.getProjectWeeklyHours(projectId, weekStart)

    return NextResponse.json({ hours }, { status: 200 })
  } catch (error: unknown) {
    console.error("Erro na API de horas semanais do projeto:", error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
