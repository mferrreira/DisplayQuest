import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/database/prisma"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"

type StoryArcMetadata = {
  totalSteps?: number
  minLevel?: number
  minElo?: string
  dependsOnArcCodes?: string[]
  steps?: Array<{
    requirement?: Record<string, unknown>
    reward?: Record<string, unknown>
  }>
}

function normalizeStoryArcMetadata(input: unknown): StoryArcMetadata {
  const source = (input && typeof input === "object" ? input : {}) as StoryArcMetadata
  const dependsOnArcCodes = Array.isArray(source.dependsOnArcCodes)
    ? source.dependsOnArcCodes
        .map((value) => String(value || "").trim().toUpperCase())
        .filter(Boolean)
    : []

  return {
    totalSteps: Number.isFinite(source.totalSteps) ? Math.max(1, Number(source.totalSteps)) : undefined,
    minLevel: Number.isFinite(source.minLevel) ? Math.max(1, Number(source.minLevel)) : undefined,
    minElo:
      typeof source.minElo === "string" && source.minElo.trim()
        ? source.minElo.trim().toUpperCase()
        : undefined,
    dependsOnArcCodes,
    steps: Array.isArray(source.steps) ? source.steps : [],
  }
}

export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS")
    if (deny) return deny

    const storyArcs = await prisma.gamification_story_arcs.findMany({
      orderBy: [{ chapter: "asc" }, { id: "asc" }],
    })
    return NextResponse.json({ storyArcs }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao listar arcos narrativos"
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
    const code = String(body.code || "").trim().toUpperCase()
    const title = String(body.title || "").trim()
    if (!code || !title) {
      return NextResponse.json({ error: "code e title são obrigatórios" }, { status: 400 })
    }

    const startsAt = typeof body.startsAt === "string" && body.startsAt.trim() ? new Date(body.startsAt) : null
    const endsAt = typeof body.endsAt === "string" && body.endsAt.trim() ? new Date(body.endsAt) : null
    if (startsAt && Number.isNaN(startsAt.getTime())) {
      return NextResponse.json({ error: "startsAt inválido" }, { status: 400 })
    }
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      return NextResponse.json({ error: "endsAt inválido" }, { status: 400 })
    }

    const storyArc = await prisma.gamification_story_arcs.create({
      data: {
        code,
        title,
        description: typeof body.description === "string" ? body.description.trim() : null,
        chapter: Number.isFinite(body.chapter) ? Math.max(1, Number(body.chapter)) : 1,
        active: typeof body.active === "boolean" ? body.active : true,
        startsAt,
        endsAt,
        metadata: normalizeStoryArcMetadata(body.metadata) as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({ storyArc }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao criar arco narrativo"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
