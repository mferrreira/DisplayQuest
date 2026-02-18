import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { hasPermission } from "@/lib/auth/rbac"
import { createGamificationModule } from "@/backend/modules/gamification"

const gamificationModule = createGamificationModule()

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

    const canManageUsers = hasPermission(auth.actor.roles, "MANAGE_USERS")
    if (!canManageUsers && userId !== auth.actor.id) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
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
  } catch (error) {
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
  } catch (error: any) {
    console.error("Erro ao conceder badge:", error)
    return NextResponse.json({ error: error.message || "Erro ao conceder badge" }, { status: 500 })
  }
}
