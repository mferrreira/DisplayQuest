import { NextResponse } from "next/server"
import { createGamificationModule } from "@/backend/modules/gamification"
import { requireApiActor } from "@/lib/auth/api-guard"

const gamificationModule = createGamificationModule()

export async function POST(
  request: Request,
  context: { params: Promise<{ chestId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { chestId } = await context.params
    const body = await request.json().catch(() => ({}))
    const quantity = Number.isFinite(body.quantity) ? Number(body.quantity) : 1

    const result = await gamificationModule.openChest({
      userId: auth.actor.id,
      chestId,
      quantity,
    })

    return NextResponse.json({ result }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao abrir baú"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
