import { NextResponse } from "next/server"
import { createGamificationModule } from "@/backend/modules/gamification"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"

const gamificationModule = createGamificationModule()

export async function GET() {
  try {
    const badges = await gamificationModule.listBadges()
    return NextResponse.json({ badges })
  } catch (error) {
    console.error("Erro ao buscar badges:", error)
    return NextResponse.json({ error: "Erro ao buscar badges" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS", "Sem permissão para criar badges")
    if (deny) return deny

    const body = await request.json()
    const badge = await gamificationModule.createBadge({
      ...body,
      createdBy: auth.actor.id,
    })

    return NextResponse.json({ badge }, { status: 201 })
  } catch (error: any) {
    console.error("Erro ao criar badge:", error)
    return NextResponse.json({ error: error.message || "Erro ao criar badge" }, { status: 500 })
  }
}
