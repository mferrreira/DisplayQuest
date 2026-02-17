import { NextResponse } from "next/server"
import { prisma } from "@/lib/database/prisma"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"

export async function PUT(
  request: Request,
  context: { params: Promise<{ chestId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS")
    if (deny) return deny

    const { chestId } = await context.params
    const body = await request.json().catch(() => ({}))

    const chest = await prisma.gamification_chest_definitions.update({
      where: { id: chestId },
      data: {
        name: typeof body.name === "string" ? body.name.trim() : undefined,
        description: typeof body.description === "string" ? body.description.trim() : undefined,
        rarity: typeof body.rarity === "string" ? body.rarity.trim().toLowerCase() : undefined,
        priceCoins: Number.isFinite(body.priceCoins) ? Math.max(1, Number(body.priceCoins)) : undefined,
        minDrops: Number.isFinite(body.minDrops) ? Math.max(1, Number(body.minDrops)) : undefined,
        maxDrops: Number.isFinite(body.maxDrops) ? Math.max(1, Number(body.maxDrops)) : undefined,
        active: typeof body.active === "boolean" ? body.active : undefined,
      },
      include: {
        drops: {
          orderBy: { id: "asc" },
        },
      },
    })

    if (chest.maxDrops < chest.minDrops) {
      await prisma.gamification_chest_definitions.update({
        where: { id: chest.id },
        data: { maxDrops: chest.minDrops },
      })
    }

    return NextResponse.json({ chest }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar baú"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ chestId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS")
    if (deny) return deny

    const { chestId } = await context.params
    await prisma.gamification_chest_definitions.delete({
      where: { id: chestId },
    })

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao excluir baú"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
