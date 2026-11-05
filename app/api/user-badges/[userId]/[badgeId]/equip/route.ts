import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

// plan-v15 S04 (R9): equipar/desequipar a passiva no slot do perfil.
// Gate de self mora no use case (`equipViolation`) — só a própria pessoa. Os params são
// validados na rota ANTES do use case porque a decisão de self precisa do userId: a ordem
// medida é 400 de parâmetro -> 403 self -> 404 -> 409. domainErrorResponse mapeia as
// DomainError do módulo (Forbidden 403, NotFound 404, Conflict 409, Validation 400).

const { gamification: gamificationModule } = getBackendComposition()

export async function POST(request: Request, context: { params: Promise<{ userId: string; badgeId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const userId = Number(params.userId)
    const badgeId = Number(params.badgeId)

    if (!Number.isInteger(userId) || !Number.isInteger(badgeId) || userId <= 0 || badgeId <= 0) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 })
    }

    const body = await request.json()
    const equipped = body?.equipped
    if (typeof equipped !== "boolean") {
      return NextResponse.json({ error: "equipped é obrigatório" }, { status: 400 })
    }

    const userBadge = await gamificationModule.equipUserBadge({
      actorId: auth.actor.id,
      userId,
      badgeId,
      equipped,
    })

    return NextResponse.json({ userBadge })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    return routeErrorResponse(error, { fallback: "Erro ao alterar badge equipado", exposeMessage: true })
  }
}
