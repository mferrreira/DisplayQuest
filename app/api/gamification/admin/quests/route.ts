import { NextResponse } from "next/server"
import { prisma } from "@/lib/database/prisma"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"

export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS")
    if (deny) return deny

    const quests = await prisma.gamification_quest_definitions.findMany({
      orderBy: [{ questType: "asc" }, { id: "asc" }],
    })
    return NextResponse.json({ quests }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao listar quests"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS")
    if (deny) return deny

    const body = await request.json().catch(() => ({}))

    const code = String(body.code || "").trim()
    const title = String(body.title || "").trim()
    if (!code || !title) {
      return NextResponse.json({ error: "code e title são obrigatórios" }, { status: 400 })
    }

    const quest = await prisma.gamification_quest_definitions.create({
      data: {
        code,
        title,
        description: typeof body.description === "string" ? body.description.trim() : null,
        questType: typeof body.questType === "string" ? body.questType.trim().toUpperCase() : "DAILY",
        scope: typeof body.scope === "string" ? body.scope.trim().toUpperCase() : "PROJECT",
        minElo: typeof body.minElo === "string" && body.minElo.trim() ? body.minElo.trim().toUpperCase() : null,
        minLevel: Number.isFinite(body.minLevel) ? Math.max(1, Number(body.minLevel)) : null,
        requirements: body.requirements ?? {},
        rewards: body.rewards ?? {},
        active: typeof body.active === "boolean" ? body.active : true,
      },
    })

    return NextResponse.json({ quest }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao criar quest"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
