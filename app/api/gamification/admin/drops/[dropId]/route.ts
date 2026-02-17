import { NextResponse } from "next/server"
import { prisma } from "@/lib/database/prisma"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"

export async function PUT(
  request: Request,
  context: { params: Promise<{ dropId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS")
    if (deny) return deny

    const { dropId } = await context.params
    const parsedDropId = Number.parseInt(dropId, 10)
    if (Number.isNaN(parsedDropId)) {
      return NextResponse.json({ error: "dropId inválido" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const drop = await prisma.gamification_chest_drop_entries.update({
      where: { id: parsedDropId },
      data: {
        itemKey: typeof body.itemKey === "string" ? body.itemKey.trim() : undefined,
        itemName: typeof body.itemName === "string" ? body.itemName.trim() : undefined,
        rarity: typeof body.rarity === "string" ? body.rarity.trim().toLowerCase() : undefined,
        weight: Number.isFinite(body.weight) ? Math.max(1, Number(body.weight)) : undefined,
        qtyMin: Number.isFinite(body.qtyMin) ? Math.max(1, Number(body.qtyMin)) : undefined,
        qtyMax: Number.isFinite(body.qtyMax) ? Math.max(1, Number(body.qtyMax)) : undefined,
        active: typeof body.active === "boolean" ? body.active : undefined,
      },
    })

    if (drop.qtyMax < drop.qtyMin) {
      await prisma.gamification_chest_drop_entries.update({
        where: { id: drop.id },
        data: { qtyMax: drop.qtyMin },
      })
    }

    return NextResponse.json({ drop }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar drop"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ dropId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS")
    if (deny) return deny

    const { dropId } = await context.params
    const parsedDropId = Number.parseInt(dropId, 10)
    if (Number.isNaN(parsedDropId)) {
      return NextResponse.json({ error: "dropId inválido" }, { status: 400 })
    }

    await prisma.gamification_chest_drop_entries.delete({
      where: { id: parsedDropId },
    })
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao excluir drop"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
