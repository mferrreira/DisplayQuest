import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { hasPermission } from "@/lib/auth/rbac"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const canManageUsers = hasPermission(auth.actor.roles, "MANAGE_USERS")
    if (!canManageUsers && auth.actor.id !== id) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const user = await userManagementModule.findUserById(id)
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error("Erro ao buscar usuário:", error)
    return NextResponse.json({ error: "Erro ao buscar usuário" }, { status: 500 })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const body = await request.json()
    const canManageUsers = hasPermission(auth.actor.roles, "MANAGE_USERS")
    if (!canManageUsers && auth.actor.id !== id) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const allowedSelfFields = ["name", "email", "bio", "avatar", "profileVisibility", "password"]
    const filteredBody = canManageUsers
      ? body
      : Object.fromEntries(Object.entries(body).filter(([key]) => allowedSelfFields.includes(key)))

    const user = await userManagementModule.updateUser(id, filteredBody)
    return NextResponse.json({ user })
  } catch (error: any) {
    console.error("Erro ao atualizar usuário:", error)
    return NextResponse.json({ error: error.message || "Erro ao atualizar usuário" }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const canManageUsers = hasPermission(auth.actor.roles, "MANAGE_USERS")
    if (!canManageUsers) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    await userManagementModule.deleteUser(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro ao excluir usuário:", error)
    return NextResponse.json({ error: error.message || "Erro ao excluir usuário" }, { status: 500 })
  }
}
