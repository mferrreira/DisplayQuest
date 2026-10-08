import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { userActor } from "@/backend/domain"

// OND6-B4 (R4): "Usuário não possui este badge" antes caía no 500 com error.message;
// agora NotFoundError -> 404 (mensagem pinada pelo contract OND6-B3).
//
// B6-2c (D4): o gate de MANAGE_USERS desceu para o módulo gamification, e a validação dos
// params ficou na rota DEPOIS dele — a ordem medida era gate → 400 "Parâmetros inválidos".
// `assertCanManageUserBadges` roda antes de a rota tocar em `context.params`, porque descer o
// gate sozinho inverteria essa ordem.

const { gamification: gamificationModule } = getBackendComposition()
export async function DELETE(_request: Request, context: { params: Promise<{ userId: string; badgeId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    // D4/B6-2c: o ator vem da sessão e de mais nenhum lugar (ver user-badges/route.ts).
    const actor = userActor(auth.actor.id, auth.actor.roles)
    await gamificationModule.assertCanManageUserBadges({ actor })

    const params = await context.params
    const userId = Number(params.userId)
    const badgeId = Number(params.badgeId)

    if (!Number.isInteger(userId) || !Number.isInteger(badgeId) || userId <= 0 || badgeId <= 0) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 })
    }

    await gamificationModule.removeUserBadge({ actor, userId, badgeId })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao remover badge do usuário:", error)
    const message = error instanceof Error ? error.message : undefined
    return NextResponse.json({ error: message || "Erro ao remover badge do usuário" }, { status: 500 })
  }
}
