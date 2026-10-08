import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { userActor } from "@/backend/domain"

// OND6-B4 (R4): DomainErrors mapeados por domainErrorResponse. EVOLUTION: no POST,
// "Badge não encontrado" antes caía no 500 com error.message -> agora 404; "Usuário já
// possui este badge" -> 409 ConflictError (mensagens pinadas pelo contract OND6-B3).
//
// B6-2c (D4): o gate de MANAGE_USERS do POST desceu para o módulo gamification. A ordem medida
// era gate → leitura do corpo → 400, então `assertCanManageUserBadges` roda ANTES do parse —
// sem ele, um chamador sem permissão com corpo inválido receberia 400 em vez de 403.
//
// GET /api/user-badges segue LEITURA ABERTA (dono, 2026-10-07): qualquer autenticado lê os
// badges de qualquer userId — ver perfis dos outros inclui ver as insígnias. Exige sessão
// (requireApiActor), não permissão; fixado em tests/unit/api/user-badges-authorization.test.ts.

const { gamification: gamificationModule } = getBackendComposition()
export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const userIdParam = searchParams.get("userId")
    const limitParam = searchParams.get("limit")

    if (!userIdParam) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 })
    }

    const userId = Number(userIdParam)
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 })
    }

    const badges = await gamificationModule.listUserBadges(userId)
    const limit = limitParam ? Number(limitParam) : undefined
    const recentBadges = await gamificationModule.listRecentUserBadges(
      userId,
      Number.isInteger(limit) && (limit as number) > 0 ? (limit as number) : undefined,
    )

    return NextResponse.json({
      badges,
      recentBadges,
      count: badges.length,
    })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar badges do usuário" })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    // D4/B6-2c: o ator vem da sessão e de mais nenhum lugar — é o que impede uma rota de
    // declarar um `systemActor` e furar o gate (há teste que falha o build se isso acontecer).
    const actor = userActor(auth.actor.id, auth.actor.roles)

    // D4/B6-2c: o gate desceu, mas a ORDEM não. A validação abaixo é de rota, com mensagem
    // congelada em teste, então ela não pode descer junto — e sem esta chamada o 403 passaria
    // a vir DEPOIS do 400 para quem não tem MANAGE_USERS.
    await gamificationModule.assertCanManageUserBadges({ actor })

    const body = await request.json()
    const badgeId = Number(body?.badgeId)
    const userId = Number(body?.userId)

    if (!Number.isInteger(badgeId) || !Number.isInteger(userId) || badgeId <= 0 || userId <= 0) {
      return NextResponse.json({ error: "badgeId e userId são obrigatórios" }, { status: 400 })
    }

    const userBadge = await gamificationModule.awardBadge({
      badgeId,
      userId,
      awardedBy: Number(body?.awardedBy) || auth.actor.id,
      actor,
    })

    return NextResponse.json({ userBadge }, { status: 201 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao conceder badge", exposeMessage: true })
  }
}
