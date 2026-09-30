import { prisma } from "@/lib/database/prisma"
import type {
  WeeklyHoursHistoryRepository,
  WeeklyHoursHistoryRow,
} from "@/backend/modules/reporting/application/ports/weekly-hours-history.repository"

/** OND7-B3 — thin Prisma adapter over `weekly_hours_history` (window/orderBy decided by
 * the use case; user include frozen from listWeeklyHoursHistory). */
export class PrismaWeeklyHoursHistoryRepository implements WeeklyHoursHistoryRepository {
  async findMany(query: {
    userId?: number
    window?: { gte: Date; lt: Date }
    orderBy: "totalHours" | "weekStart"
  }): Promise<WeeklyHoursHistoryRow[]> {
    return await prisma.weekly_hours_history.findMany({
      where: {
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.window ? { weekStart: { gte: query.window.gte, lt: query.window.lt } } : {}),
      },
      orderBy: query.orderBy === "totalHours" ? { totalHours: "desc" } : { weekStart: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, roles: true } },
      },
    })
  }

  async findByWeek(userId: number, weekStart: Date): Promise<WeeklyHoursHistoryRow | null> {
    return await prisma.weekly_hours_history.findFirst({
      where: { userId, weekStart },
    })
  }

  async create(data: {
    userId: number
    userName: string
    weekStart: Date
    weekEnd: Date
    totalHours: number
  }): Promise<WeeklyHoursHistoryRow> {
    const created = await prisma.weekly_hours_history.create({ data })
    return { ...created, user: undefined }
  }
}
