import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_USERS")
    if (deny) return deny

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const body = await request.json()
    const action = body?.action
    const points = Number(body?.points)

    if (!Number.isFinite(points) || points < 0) {
      return NextResponse.json({ error: "Pontos devem ser um número não negativo" }, { status: 400 })
    }

    if (!["add", "remove", "set"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
    }

    const user = await userManagementModule.updateUserPoints({
      userId: id,
      action,
      points,
    })

    return NextResponse.json({ user })
  } catch (error: any) {
    console.error("Erro ao atualizar pontos do usuário:", error)
    return NextResponse.json({ error: error.message || "Erro ao atualizar pontos do usuário" }, { status: 500 })
  }
}
