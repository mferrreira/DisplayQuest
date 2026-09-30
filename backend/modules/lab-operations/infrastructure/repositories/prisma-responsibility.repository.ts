import { prisma } from "@/lib/database/prisma"
import { LabResponsibility } from "@/backend/models/LabResponsibility"
import type { ResponsibilityRepository } from "@/backend/modules/lab-operations/application/ports/responsibility.repository"

/**
 * OND8-B3 — adapter Prisma fino de `lab_responsibilities` (R2). Colunas startTime/
 * endTime/pausedAt são String ISO no schema — o adapter converte (igual ao
 * LabResponsibility.toPrisma legado) e LabResponsibility.fromPrisma devolve Dates.
 * findActive é GLOBAL (QUIRK-8L10). orderBy startTime desc congelado do legado.
 */

const ORDER = { startTime: "desc" as const }

const toIso = (value?: Date | null): string | null | undefined => {
  if (value === undefined) return undefined
  return value ? value.toISOString() : null
}

export class PrismaResponsibilityRepository implements ResponsibilityRepository {
  async findAll(): Promise<LabResponsibility[]> {
    const rows = await prisma.lab_responsibilities.findMany({ orderBy: ORDER })
    return rows.map(LabResponsibility.fromPrisma)
  }

  async findById(id: number): Promise<LabResponsibility | null> {
    const row = await prisma.lab_responsibilities.findUnique({ where: { id } })
    return row ? LabResponsibility.fromPrisma(row) : null
  }

  async findActive(): Promise<LabResponsibility | null> {
    const row = await prisma.lab_responsibilities.findFirst({
      where: { endTime: null },
      orderBy: ORDER,
    })
    return row ? LabResponsibility.fromPrisma(row) : null
  }

  async findActiveForUser(userId: number): Promise<LabResponsibility | null> {
    const row = await prisma.lab_responsibilities.findFirst({
      where: { userId, endTime: null },
      orderBy: ORDER,
    })
    return row ? LabResponsibility.fromPrisma(row) : null
  }

  async findPausedForUser(userId: number): Promise<LabResponsibility | null> {
    const row = await prisma.lab_responsibilities.findFirst({
      where: { userId, endTime: null, pausedAt: { not: null } },
      orderBy: ORDER,
    })
    return row ? LabResponsibility.fromPrisma(row) : null
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<LabResponsibility[]> {
    // Query de OVERLAP legada (LabResponsibilityRepository.findByDateRange): startTime <= fim
    // AND (endTime null OR endTime >= inicio) — colunas String ISO.
    const rows = await prisma.lab_responsibilities.findMany({
      where: {
        AND: [
          { startTime: { lte: endDate.toISOString() } },
          { OR: [{ endTime: null }, { endTime: { gte: startDate.toISOString() } }] },
        ],
      },
      orderBy: ORDER,
    })
    return rows.map(LabResponsibility.fromPrisma)
  }

  async create(input: {
    userId: number
    userName: string
    startTime: Date
    endTime: Date | null
    pausedAt: Date | null
    totalPausedMs: number
    notes: string | null
  }): Promise<LabResponsibility> {
    const created = await prisma.lab_responsibilities.create({
      data: {
        userId: input.userId,
        userName: input.userName,
        startTime: input.startTime.toISOString(),
        endTime: toIso(input.endTime),
        pausedAt: toIso(input.pausedAt),
        totalPausedMs: input.totalPausedMs,
        notes: input.notes,
      },
    })
    return LabResponsibility.fromPrisma(created)
  }

  async update(
    id: number,
    fields: {
      endTime?: Date
      pausedAt?: Date | null
      totalPausedMs?: number
      notes?: string | null
    },
  ): Promise<LabResponsibility> {
    const data: Record<string, unknown> = {}
    if (fields.endTime !== undefined) data.endTime = toIso(fields.endTime)
    if (fields.pausedAt !== undefined) data.pausedAt = toIso(fields.pausedAt)
    if (fields.totalPausedMs !== undefined) data.totalPausedMs = fields.totalPausedMs
    if (fields.notes !== undefined) data.notes = fields.notes

    const updated = await prisma.lab_responsibilities.update({ where: { id }, data: data as never })
    return LabResponsibility.fromPrisma(updated)
  }

  async delete(id: number): Promise<void> {
    await prisma.lab_responsibilities.delete({ where: { id } })
  }
}
