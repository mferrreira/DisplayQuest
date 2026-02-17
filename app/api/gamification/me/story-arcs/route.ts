import { NextResponse } from "next/server"
import { createGamificationModule } from "@/backend/modules/gamification"
import { requireApiActor } from "@/lib/auth/api-guard"

const gamificationModule = createGamificationModule()

export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const storyArcs = await gamificationModule.listUserStoryArcs(auth.actor.id)
    return NextResponse.json({ storyArcs }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao listar arcos narrativos"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
