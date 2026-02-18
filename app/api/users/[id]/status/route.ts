import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { createUserManagementModule } from "@/backend/modules/user-management"

const userManagementModule = createUserManagementModule()

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

    if (!["approve", "reject", "suspend", "activate"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
    }

    const user = await userManagementModule.updateUserStatus({
      userId: id,
      action,
    })

    return NextResponse.json({ user })
  } catch (error: unknown) {
    console.error("Erro ao atualizar status do usuário:", error)
    const message = error instanceof Error ? error.message : "Erro ao atualizar status do usuário"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
