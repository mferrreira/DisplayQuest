import { prisma } from "@/lib/database/prisma"
import type { DailyLog } from "@/backend/domain"
import type {
  DailyLogRepositoryPort,
  NewDailyLog,
} from "@/backend/modules/work-execution/application/ports/daily-log.repository"

/**
 * PrismaDailyLogRepository (OND3-B2, R2) — thin adapter implementing DailyLogRepositoryPort.
 * Semantics mirrored from backend/repositories/DailyLogRepository (frozen by golden OND3-B1):
 * findByDate uses LOCAL day boundaries (setHours 0..23:59:59.999 of the given date).
 */
function toDomain(row: {
  id: number
  userId: number
  projectId: number | null
  date: Date
  note: string | null
  workSessionId: number | null
  createdAt: Date
}): DailyLog {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    date: row.date,
    note: row.note,
    workSessionId: row.workSessionId,
    createdAt: row.createdAt,
  }
}

export class PrismaDailyLogRepository implements DailyLogRepositoryPort {
  async findById(id: number): Promise<DailyLog | null> {
    const row = await prisma.daily_logs.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async findByUserId(userId: number): Promise<DailyLog[]> {
    const rows = await prisma.daily_logs.findMany({ where: { userId } })
    return rows.map(toDomain)
  }

  async findByProjectId(projectId: number): Promise<DailyLog[]> {
    const rows = await prisma.daily_logs.findMany({ where: { projectId } })
    return rows.map(toDomain)
  }

  async findByWorkSessionId(workSessionId: number): Promise<DailyLog | null> {
    const row = await prisma.daily_logs.findUnique({ where: { workSessionId } })
    return row ? toDomain(row) : null
  }

  async findByDate(userId: number, date: Date): Promise<DailyLog[]> {
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const rows = await prisma.daily_logs.findMany({
      where: { userId, date: { gte: startOfDay, lte: endOfDay } },
      orderBy: { date: "desc" },
    })
    return rows.map(toDomain)
  }

  async findAll(): Promise<DailyLog[]> {
    const rows = await prisma.daily_logs.findMany()
    return rows.map(toDomain)
  }

  async create(dailyLog: NewDailyLog): Promise<DailyLog> {
    const row = await prisma.daily_logs.create({
      data: {
        userId: dailyLog.userId,
        projectId: dailyLog.projectId ?? null,
        date: dailyLog.date,
        note: dailyLog.note ?? null,
        workSessionId: dailyLog.workSessionId ?? null,
      },
    })
    return toDomain(row)
  }

  async update(dailyLog: DailyLog & { id: number }): Promise<DailyLog> {
    const row = await prisma.daily_logs.update({
      where: { id: dailyLog.id },
      data: {
        projectId: dailyLog.projectId ?? null,
        date: dailyLog.date,
        note: dailyLog.note ?? null,
        workSessionId: dailyLog.workSessionId ?? null,
      },
    })
    return toDomain(row)
  }

  async findUserById(userId: number): Promise<{ id: number; name: string } | null> {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    })
    return user ?? null
  }
}

export function createPrismaDailyLogRepository(): PrismaDailyLogRepository {
  return new PrismaDailyLogRepository()
}
