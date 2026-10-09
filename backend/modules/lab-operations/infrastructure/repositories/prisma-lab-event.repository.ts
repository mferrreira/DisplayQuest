import { prisma } from "@/lib/database/prisma"
import { LabEvent } from "@/backend/models/LabEvent"
import type { LabEventRepository } from "@/backend/modules/lab-operations/application/ports/lab-event.repository"

/**
 * OND8-B3 — adapter Prisma fino de `lab_events` (R2). orderBy date asc congelado do
 * legado (findByDate/findByDateRange); records via LabEvent.fromPrisma (toJSON exato).
 */
export class PrismaLabEventRepository implements LabEventRepository {
  async findById(id: number): Promise<LabEvent | null> {
    const row = await prisma.lab_events.findUnique({ where: { id } })
    return row ? LabEvent.fromPrisma(row) : null
  }

  async findByDateRange(start: Date, end: Date): Promise<LabEvent[]> {
    const rows = await prisma.lab_events.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
    })
    return rows.map(LabEvent.fromPrisma)
  }

  async create(input: { userId: number; userName: string; date: Date; note: string }): Promise<LabEvent> {
    const created = await prisma.lab_events.create({ data: input as never })
    return LabEvent.fromPrisma(created)
  }

  async update(id: number, fields: { date?: Date; note?: string }): Promise<LabEvent> {
    const updated = await prisma.lab_events.update({ where: { id }, data: fields as never })
    return LabEvent.fromPrisma(updated)
  }

  async delete(id: number): Promise<void> {
    await prisma.lab_events.delete({ where: { id } })
  }
}
