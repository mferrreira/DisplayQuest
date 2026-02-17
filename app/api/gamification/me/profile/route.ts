import { NextResponse } from "next/server"
import { createGamificationModule } from "@/backend/modules/gamification"
import { requireApiActor } from "@/lib/auth/api-guard"

const gamificationModule = createGamificationModule()

export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const profile = await gamificationModule.getUserProfile(auth.actor.id)
    return NextResponse.json({ profile }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao buscar perfil gamificado"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const body = await request.json().catch(() => ({}))

    const profile = await gamificationModule.updateUserProfile({
      userId: auth.actor.id,
      data: {
        displayName: typeof body.displayName === "string" || body.displayName === null ? body.displayName : undefined,
        archetype: typeof body.archetype === "string" || body.archetype === null ? body.archetype : undefined,
        title: typeof body.title === "string" || body.title === null ? body.title : undefined,
        bioRpg: typeof body.bioRpg === "string" || body.bioRpg === null ? body.bioRpg : undefined,
        lore: typeof body.lore === "string" || body.lore === null ? body.lore : undefined,
      },
    })

    return NextResponse.json({ profile }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar perfil gamificado"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

