import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { PENDING_MODERATION_DENIED_MESSAGE, userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
// B6-4 (D4): MANAGE_USERS com a mensagem propria "Acesso negado." (ponto final congelado) mora
// nos use cases do fluxo. O POST chama o assert ANTES do parse (ordem medida: gate antes da
// validacao "ID do usuario e acao sao obrigatorios"); o GET nao tem validacao antes do gate,
// entao o gate do proprio ListPendingUsersUseCase basta.
export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const pendingUsers = await userManagementModule.listPendingUsers(
      userActor(auth.actor.id, auth.actor.roles),
    )
    return NextResponse.json({ pendingUsers }, { status: 200 })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar usuários pendentes:", error)
    return NextResponse.json({ error: "Erro ao buscar usuários pendentes" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const actor = userActor(auth.actor.id, auth.actor.roles)
    userManagementModule.assertCanManageUsers({ actor, deniedMessage: PENDING_MODERATION_DENIED_MESSAGE })

    const body = await request.json()
    const userId = Number(body?.userId)
    const action = body?.action

    if (!Number.isInteger(userId) || userId <= 0 || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "ID do usuário e ação são obrigatórios" }, { status: 400 })
    }

    const user = await userManagementModule.moderatePendingUser(actor, userId, action)

    return NextResponse.json(
      {
        user,
        message:
          action === "approve"
            ? "Usuário aprovado com sucesso"
            : "Usuário rejeitado e removido do sistema",
      },
      { status: 200 },
    )
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }
    console.error("Erro ao aprovar/rejeitar usuário:", error)
    return NextResponse.json({ error: "Erro ao processar solicitação" }, { status: 500 })
  }
}
