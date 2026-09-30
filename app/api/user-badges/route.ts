import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { hasPermission } from "@/lib/auth/rbac"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

// OND6-B4 (R4): DomainErrors mapeados por domainErrorResponse. EVOLUTION: no POST,
// "Badge não encontrado" antes caía no 500 com error.message -> agora 404; "Usuário já
// possui este badge" -> 409 ConflictError (mensagens pinadas pelo contract OND6-B3).

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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar badges do usuário:", error)
    return NextResponse.json({ error: "Erro ao buscar badges do usuário" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const canManageUsers = hasPermission(auth.actor.roles, "MANAGE_USERS")
    if (!canManageUsers) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

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
    })

    return NextResponse.json({ userBadge }, { status: 201 })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao conceder badge:", error)
    const message = error instanceof Error ? error.message : undefined
    return NextResponse.json({ error: message || "Erro ao conceder badge" }, { status: 500 })
  }
}
