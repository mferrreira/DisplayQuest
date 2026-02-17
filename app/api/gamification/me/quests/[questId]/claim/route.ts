import { NextResponse } from "next/server"
import { createGamificationModule } from "@/backend/modules/gamification"
import { requireApiActor } from "@/lib/auth/api-guard"

const gamificationModule = createGamificationModule()

export async function POST(
  _request: Request,
  context: { params: Promise<{ questId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { questId } = await context.params
    const parsedQuestId = Number.parseInt(questId, 10)
    if (Number.isNaN(parsedQuestId)) {
      return NextResponse.json({ error: "questId inválido" }, { status: 400 })
    }

    const result = await gamificationModule.claimQuestReward({
      userId: auth.actor.id,
      questId: parsedQuestId,
    })

    return NextResponse.json({ result }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao resgatar recompensa da quest"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
