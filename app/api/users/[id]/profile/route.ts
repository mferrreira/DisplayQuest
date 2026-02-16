import { NextResponse } from "next/server"
import { requireApiActor, ensureSelfOrPermission } from "@/lib/auth/api-guard"
import { createUserManagementModule } from "@/backend/modules/user-management"

const userManagementModule = createUserManagementModule()

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const deny = ensureSelfOrPermission(auth.actor, id, "MANAGE_USERS", "Não autorizado")
    if (deny) return deny

    const user = await userManagementModule.findUserById(id)
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error: any) {
    console.error("Erro ao buscar perfil do usuário:", error)
    return NextResponse.json({ error: error.message || "Erro ao buscar perfil do usuário" }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const deny = ensureSelfOrPermission(auth.actor, id, "MANAGE_USERS", "Não autorizado")
    if (deny) return deny

    const body = await request.json()
    const user = await userManagementModule.updateUserProfile(id, body)
    return NextResponse.json({ user })
  } catch (error: any) {
    console.error("Erro ao atualizar perfil do usuário:", error)
    return NextResponse.json({ error: error.message || "Erro ao atualizar perfil do usuário" }, { status: 500 })
  }
}
