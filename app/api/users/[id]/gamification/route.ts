import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { userActor } from "@/backend/domain"

// OND6-B4 (R4): "Usuário não encontrado" antes caía no 500; agora NotFoundError -> 404
// (mensagem pinada pelo contract OND6-B3). Nao-DomainError mantem o shape legado.
//
// B6-2c (D4, DEC-115): o gate ensureSelfOrPermission(actor, userId, "MANAGE_USERS") desceu
// para ReadUserProgressionUseCase. A ORDEM é a medida: validação do id (400 "Usuário inválido")
// ANTES do gate, então a rota valida e depois chama — quem não é dono nem gestor continua
// recebendo 403 depois do 400, exatamente como antes.

const { gamification: gamificationModule } = getBackendComposition()
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const userId = Number(params.id)
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    // D4/B6-2c: o ator vem da sessão e de mais nenhum lugar (ver user-badges/route.ts).
    const actor = userActor(auth.actor.id, auth.actor.roles)
    const progression = await gamificationModule.readUserProgression({ actor, userId })
    return NextResponse.json({ progression }, { status: 200 })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    const message = error instanceof Error ? error.message : "Erro ao buscar progressão"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
