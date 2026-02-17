import { NextResponse } from "next/server"
import { prisma } from "@/lib/database/prisma"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"

export async function PUT(
  request: Request,
  context: { params: Promise<{ questId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS")
    if (deny) return deny

    const { questId } = await context.params
    const parsedQuestId = Number.parseInt(questId, 10)
    if (Number.isNaN(parsedQuestId)) {
      return NextResponse.json({ error: "questId inválido" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const quest = await prisma.gamification_quest_definitions.update({
      where: { id: parsedQuestId },
      data: {
        code: typeof body.code === "string" ? body.code.trim() : undefined,
        title: typeof body.title === "string" ? body.title.trim() : undefined,
        description: typeof body.description === "string" ? body.description.trim() : undefined,
        questType: typeof body.questType === "string" ? body.questType.trim().toUpperCase() : undefined,
        scope: typeof body.scope === "string" ? body.scope.trim().toUpperCase() : undefined,
        minElo: typeof body.minElo === "string" ? (body.minElo.trim() || null) : undefined,
        minLevel: Number.isFinite(body.minLevel) ? Math.max(1, Number(body.minLevel)) : undefined,
        requirements: body.requirements !== undefined ? body.requirements : undefined,
        rewards: body.rewards !== undefined ? body.rewards : undefined,
        active: typeof body.active === "boolean" ? body.active : undefined,
      },
    })

    return NextResponse.json({ quest }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar quest"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ questId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS")
    if (deny) return deny

    const { questId } = await context.params
    const parsedQuestId = Number.parseInt(questId, 10)
    if (Number.isNaN(parsedQuestId)) {
      return NextResponse.json({ error: "questId inválido" }, { status: 400 })
    }

    await prisma.gamification_quest_definitions.delete({
      where: { id: parsedQuestId },
    })

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao excluir quest"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
