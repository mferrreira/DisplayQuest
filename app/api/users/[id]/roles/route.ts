import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { normalizeRoles } from "@/lib/auth/rbac"
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

    if (!["add", "remove", "set"].includes(action)) {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
    }

    const role = typeof body?.role === "string" ? body.role : undefined
    const normalizedRoles = normalizeRoles(body?.roles) as UserRole[]

    if (action !== "set" && !role) {
      return NextResponse.json({ error: "Role é obrigatório" }, { status: 400 })
    }

    if (action === "set" && !Array.isArray(body?.roles)) {
      return NextResponse.json({ error: "Roles array é obrigatório para definir" }, { status: 400 })
    }

    const user = await userManagementModule.updateUserRoles({
      userId: id,
      action,
      role: role as UserRole | undefined,
      roles: normalizedRoles,
    })

    return NextResponse.json({ user })
  } catch (error: unknown) {
    console.error("Erro ao atualizar roles do usuário:", error)
    const message = error instanceof Error ? error.message : "Erro ao atualizar roles do usuário"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
