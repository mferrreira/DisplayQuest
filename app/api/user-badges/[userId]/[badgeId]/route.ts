import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { hasPermission } from "@/lib/auth/rbac"
import { getBackendComposition } from "@/backend/composition/root"
const { gamification: gamificationModule } = getBackendComposition()
export async function DELETE(_request: Request, context: { params: Promise<{ userId: string; badgeId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const canManageUsers = hasPermission(auth.actor.roles, "MANAGE_USERS")
    if (!canManageUsers) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const params = await context.params
    const userId = Number(params.userId)
    const badgeId = Number(params.badgeId)

    if (!Number.isInteger(userId) || !Number.isInteger(badgeId) || userId <= 0 || badgeId <= 0) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 })
    }

    await gamificationModule.removeUserBadge(userId, badgeId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro ao remover badge do usuário:", error)
    return NextResponse.json({ error: error.message || "Erro ao remover badge do usuário" }, { status: 500 })
  }
}
