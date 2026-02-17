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

export async function PUT(
  request: Request,
  context: { params: Promise<{ arcId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS")
    if (deny) return deny

    const { arcId } = await context.params
    const parsedArcId = Number.parseInt(arcId, 10)
    if (Number.isNaN(parsedArcId)) {
      return NextResponse.json({ error: "arcId inválido" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const existing = await prisma.gamification_story_arcs.findUnique({
      where: { id: parsedArcId },
      select: { metadata: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "Arco narrativo não encontrado" }, { status: 404 })
    }

    const oldMetadata = normalizeStoryArcMetadata(existing.metadata)
    const incomingMetadata = body.metadata !== undefined ? normalizeStoryArcMetadata(body.metadata) : null
    const mergedMetadata: StoryArcMetadata = {
      ...oldMetadata,
      ...(incomingMetadata || {}),
    }

    const startsAt = body.startsAt === null
      ? null
      : typeof body.startsAt === "string" && body.startsAt.trim()
        ? new Date(body.startsAt)
        : undefined
    const endsAt = body.endsAt === null
      ? null
      : typeof body.endsAt === "string" && body.endsAt.trim()
        ? new Date(body.endsAt)
        : undefined
    if (startsAt instanceof Date && Number.isNaN(startsAt.getTime())) {
      return NextResponse.json({ error: "startsAt inválido" }, { status: 400 })
    }
    if (endsAt instanceof Date && Number.isNaN(endsAt.getTime())) {
      return NextResponse.json({ error: "endsAt inválido" }, { status: 400 })
    }

    const storyArc = await prisma.gamification_story_arcs.update({
      where: { id: parsedArcId },
      data: {
        code: typeof body.code === "string" ? body.code.trim().toUpperCase() : undefined,
        title: typeof body.title === "string" ? body.title.trim() : undefined,
        description: typeof body.description === "string" ? body.description.trim() : undefined,
        chapter: Number.isFinite(body.chapter) ? Math.max(1, Number(body.chapter)) : undefined,
        active: typeof body.active === "boolean" ? body.active : undefined,
        startsAt,
        endsAt,
        metadata: body.metadata !== undefined ? (mergedMetadata as Prisma.InputJsonValue) : undefined,
      },
    })

    return NextResponse.json({ storyArc }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar arco narrativo"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ arcId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS")
    if (deny) return deny

    const { arcId } = await context.params
    const parsedArcId = Number.parseInt(arcId, 10)
    if (Number.isNaN(parsedArcId)) {
      return NextResponse.json({ error: "arcId inválido" }, { status: 400 })
    }

    await prisma.gamification_story_arcs.delete({
      where: { id: parsedArcId },
    })
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao excluir arco narrativo"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
