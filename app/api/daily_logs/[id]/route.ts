import { NextResponse } from "next/server"
import { ensureSelfOrPermission, requireApiActor } from "@/lib/auth/api-guard"
import { hasRole } from "@/lib/auth/rbac"
import { getBackendComposition } from "@/backend/composition/root"

const { workExecution: workExecutionModule } = getBackendComposition()
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const log = await workExecutionModule.getDailyLogById(Number(params.id))
    if (!log) return NextResponse.json({ error: "Log não encontrado" }, { status: 404 })

    const actor = auth.actor
    const canManageLogs = hasRole(actor.roles, "LABORATORISTA")
    if (!canManageLogs) {
      const accessError = ensureSelfOrPermission(actor, log.userId, "MANAGE_USERS")
      if (accessError) return accessError
    }

    return NextResponse.json({ log })
  } catch (error) {
    console.error("Erro ao buscar log diário:", error)
    return NextResponse.json({ error: "Erro ao buscar log diário" }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  void request
  void context
  return NextResponse.json(
    {
      error: "Edição de daily log foi descontinuada. Ajuste a Work Session associada.",
      deprecated: true,
      replacement: "PATCH /api/work-sessions/:id",
    },
    { status: 410 },
  )
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  void request
  void context
  return NextResponse.json(
    {
      error: "Remoção de daily log foi descontinuada. Ajuste a Work Session associada.",
      deprecated: true,
      replacement: "PATCH /api/work-sessions/:id",
    },
    { status: 410 },
  )
}
