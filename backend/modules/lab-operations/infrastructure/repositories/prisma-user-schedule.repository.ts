import { prisma } from "@/lib/database/prisma"
import { UserSchedule } from "@/backend/models/UserSchedule"
import type { UserScheduleRepository } from "@/backend/modules/lab-operations/application/ports/user-schedule.repository"

/**
 * OND8-B3 — adapter Prisma fino de `user_schedules` (R2). orderBy congelado do legado:
 * findAll [userId, dayOfWeek, startTime] asc; findByUserId [dayOfWeek, startTime] asc.
 * replaceForUser é o $transaction [deleteMany, createMany] legado — createMany escreve
 * CRU, sem validação por slot (QUIRK-8L13 preservado).
 */

export class PrismaUserScheduleRepository implements UserScheduleRepository {
  async findAll(): Promise<UserSchedule[]> {
    const rows = await prisma.user_schedules.findMany({
      orderBy: [{ userId: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
    })
    return rows.map(UserSchedule.fromPrisma)
  }

  async findByUserId(userId: number): Promise<UserSchedule[]> {
    const rows = await prisma.user_schedules.findMany({
      where: { userId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    })
    return rows.map(UserSchedule.fromPrisma)
  }

  async findById(id: number): Promise<UserSchedule | null> {
    const row = await prisma.user_schedules.findUnique({ where: { id } })
    return row ? UserSchedule.fromPrisma(row) : null
  }

  async create(input: { userId: number; dayOfWeek: number; startTime: string; endTime: string }): Promise<UserSchedule> {
    const created = await prisma.user_schedules.create({ data: input as never })
    return UserSchedule.fromPrisma(created)
  }

  async update(id: number, fields: { startTime?: string; endTime?: string }): Promise<UserSchedule> {
    const data: Record<string, unknown> = {}
    if (fields.startTime !== undefined) data.startTime = fields.startTime
    if (fields.endTime !== undefined) data.endTime = fields.endTime

    const updated = await prisma.user_schedules.update({ where: { id }, data: data as never })
    return UserSchedule.fromPrisma(updated)
  }

  async delete(id: number): Promise<void> {
    await prisma.user_schedules.delete({ where: { id } })
  }

  async replaceForUser(
    userId: number,
    slots: { dayOfWeek: number; startTime: string; endTime: string }[],
  ): Promise<UserSchedule[]> {
    await prisma.$transaction([
      prisma.user_schedules.deleteMany({ where: { userId } }),
      prisma.user_schedules.createMany({
        data: slots.map((slot) => ({ userId, dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime })),
      }),
    ])

    return await this.findByUserId(userId)
  }
}
