import { NextResponse } from "next/server"
import { prisma } from "@/lib/database/prisma"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"

export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS")
    if (deny) return deny

    const chests = await prisma.gamification_chest_definitions.findMany({
      include: {
        drops: {
          orderBy: { id: "asc" },
        },
      },
      orderBy: [{ priceCoins: "asc" }, { id: "asc" }],
    })

    return NextResponse.json({ chests }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao listar baús"
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
    const id = String(body.id || "").trim()
    const name = String(body.name || "").trim()
    const rarity = String(body.rarity || "common").trim().toLowerCase()
    const description = String(body.description || "").trim()
    const priceCoins = Math.max(1, Number.parseInt(String(body.priceCoins || 100), 10) || 100)
    const minDrops = Math.max(1, Number.parseInt(String(body.minDrops || 1), 10) || 1)
    const maxDrops = Math.max(minDrops, Number.parseInt(String(body.maxDrops || minDrops), 10) || minDrops)
    const active = body.active !== undefined ? Boolean(body.active) : true

    if (!id || !name) {
      return NextResponse.json({ error: "id e name são obrigatórios" }, { status: 400 })
    }

    const chest = await prisma.gamification_chest_definitions.create({
      data: {
        id,
        name,
        description,
        rarity,
        priceCoins,
        minDrops,
        maxDrops,
        active,
      },
      include: {
        drops: {
          orderBy: { id: "asc" },
        },
      },
    })

    return NextResponse.json({ chest }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao criar baú"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
