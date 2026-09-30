import { prisma } from "@/lib/database/prisma"
import { LaboratorySchedule } from "@/backend/models/LaboratorySchedule"
import type { LaboratoryScheduleRepository } from "@/backend/modules/lab-operations/application/ports/laboratory-schedule.repository"

/**
 * OND8-B3 — adapter Prisma fino de `laboratory_schedules` (R2). orderBy
 * [dayOfWeek asc, startTime asc] congelado do legado; update escreve só os campos do
 * patch (notes undefined NUNCA é escrito — QUIRK-8L12 preservado no adapter).
 */

const ORDER = [{ dayOfWeek: "asc" as const }, { startTime: "asc" as const }]

export class PrismaLaboratoryScheduleRepository implements LaboratoryScheduleRepository {
  async findAll(): Promise<LaboratorySchedule[]> {
    const rows = await prisma.laboratory_schedules.findMany({ orderBy: ORDER })
    return rows.map(LaboratorySchedule.fromPrisma)
  }

  async findById(id: number): Promise<LaboratorySchedule | null> {
    const row = await prisma.laboratory_schedules.findUnique({ where: { id } })
    return row ? LaboratorySchedule.fromPrisma(row) : null
  }

  async create(input: {
    dayOfWeek: number
    startTime: string
    endTime: string
    notes?: string | null
  }): Promise<LaboratorySchedule> {
    const created = await prisma.laboratory_schedules.create({ data: input as never })
    return LaboratorySchedule.fromPrisma(created)
  }

  async update(
    id: number,
    fields: { startTime?: string; endTime?: string; notes?: string | null },
  ): Promise<LaboratorySchedule> {
    const data: Record<string, unknown> = {}
    if (fields.startTime !== undefined) data.startTime = fields.startTime
    if (fields.endTime !== undefined) data.endTime = fields.endTime
    if (fields.notes !== undefined) data.notes = fields.notes

    const updated = await prisma.laboratory_schedules.update({ where: { id }, data: data as never })
    return LaboratorySchedule.fromPrisma(updated)
  }

  async delete(id: number): Promise<void> {
    await prisma.laboratory_schedules.delete({ where: { id } })
  }
}
