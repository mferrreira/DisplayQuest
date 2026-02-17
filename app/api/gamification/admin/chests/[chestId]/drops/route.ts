import { NextResponse } from "next/server"
import { prisma } from "@/lib/database/prisma"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"

export async function POST(
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

    const itemKey = String(body.itemKey || "").trim()
    const itemName = String(body.itemName || "").trim()
    if (!itemKey || !itemName) {
      return NextResponse.json({ error: "itemKey e itemName são obrigatórios" }, { status: 400 })
    }

    const drop = await prisma.gamification_chest_drop_entries.create({
      data: {
        chestId,
        itemKey,
        itemName,
        rarity: typeof body.rarity === "string" ? body.rarity.trim().toLowerCase() : "common",
        weight: Math.max(1, Number.parseInt(String(body.weight || 1), 10) || 1),
        qtyMin: Math.max(1, Number.parseInt(String(body.qtyMin || 1), 10) || 1),
        qtyMax: Math.max(1, Number.parseInt(String(body.qtyMax || 1), 10) || 1),
        active: typeof body.active === "boolean" ? body.active : true,
      },
    })

    if (drop.qtyMax < drop.qtyMin) {
      await prisma.gamification_chest_drop_entries.update({
        where: { id: drop.id },
        data: { qtyMax: drop.qtyMin },
      })
    }

    return NextResponse.json({ drop }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao criar drop"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
