import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_USERS", "Acesso negado.")
    if (deny) return deny

    const pendingUsers = await userManagementModule.listPendingUsers()
    return NextResponse.json({ pendingUsers }, { status: 200 })
  } catch (error) {
    console.error("Erro ao buscar usuários pendentes:", error)
    return NextResponse.json({ error: "Erro ao buscar usuários pendentes" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_USERS", "Acesso negado.")
    if (deny) return deny

    const body = await request.json()
    const userId = Number(body?.userId)
    const action = body?.action

    if (!Number.isInteger(userId) || userId <= 0 || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "ID do usuário e ação são obrigatórios" }, { status: 400 })
    }

    const user = await userManagementModule.moderatePendingUser(userId, action)

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
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }
    console.error("Erro ao aprovar/rejeitar usuário:", error)
    return NextResponse.json({ error: "Erro ao processar solicitação" }, { status: 500 })
  }
}
