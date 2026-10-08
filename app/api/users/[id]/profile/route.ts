import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { PROFILE_DENIED_MESSAGE, userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
// B6-4 (D4): self || MANAGE_USERS com a mensagem propria "Nao autorizado" desceu para os use
// cases (FindUserByIdUseCase recebe a mensagem como contrato de rota; UpdateUserProfileUseCase
// a carrega como constante). A validacao do id (400) continua ANTES do gate, como medido.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const user = await userManagementModule.findUserById(actor, id, PROFILE_DENIED_MESSAGE)
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
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

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const body = await request.json()
    const user = await userManagementModule.updateUserProfile(actor, id, body)
    return NextResponse.json({ user })
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao atualizar perfil do usuário:", error)
    return NextResponse.json({ error: error.message || "Erro ao atualizar perfil do usuário" }, { status: 500 })
  }
}
