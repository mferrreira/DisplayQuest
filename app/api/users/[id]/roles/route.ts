import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { normalizeRoles } from "@/lib/auth/rbac"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { type UserRole, userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
// B6-4 (D4): o gate MANAGE_USERS mora em UpdateUserRolesUseCase; o assert roda ANTES da
// validacao de id/acao/role (ordem medida). As validacoes de entrada com mensagens proprias
// continuam na rota.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    userManagementModule.assertCanManageUsers({ actor })

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
      actor,
      userId: id,
      action,
      role: role as UserRole | undefined,
      roles: normalizedRoles,
    })

    return NextResponse.json({ user })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao atualizar roles do usuário:", error)
    const message = error instanceof Error ? error.message : "Erro ao atualizar roles do usuário"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
