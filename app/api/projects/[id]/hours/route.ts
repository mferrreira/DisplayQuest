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

    const allowed = await projectManagementModule.canActorAccessProject(
      projectId,
      auth.actor.id,
      auth.actor.roles,
    )
    if (!allowed) {
      return NextResponse.json({ error: "Acesso negado ao projeto" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get("weekStart") || undefined
    const weekEnd = searchParams.get("weekEnd") || undefined

    const hours = await reportingModule.getProjectHours({
      projectId,
      weekStart,
      weekEnd,
    })

    return NextResponse.json({ hours }, { status: 200 })
  } catch (error: unknown) {
    console.error("Erro na API de horas do projeto:", error)
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
