import { prisma } from "@/lib/database/prisma"
import type {
  WeeklyReportRow,
  WeeklyReportsRepository,
} from "@/backend/modules/reporting/application/ports/weekly-reports.repository"

/** OND7-B3 — thin Prisma adapter over `weekly_reports` (no rules; orderBy weekStart desc
 * frozen from the legacy listWeeklyReports). */
export class PrismaWeeklyReportsRepository implements WeeklyReportsRepository {
  async findMany(query: {
    userId?: number
    weekStartGte?: Date
    weekEndLte?: Date
  }): Promise<WeeklyReportRow[]> {
    return await prisma.weekly_reports.findMany({
      where: {
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.weekStartGte ? { weekStart: { gte: query.weekStartGte } } : {}),
        ...(query.weekEndLte ? { weekEnd: { lte: query.weekEndLte } } : {}),
      },
      orderBy: { weekStart: "desc" },
    })
  }

  async findById(id: number): Promise<WeeklyReportRow | null> {
    return await prisma.weekly_reports.findUnique({ where: { id } })
  }

  async findFirstByWindow(userId: number, weekStart: Date, weekEnd: Date): Promise<{ id: number } | null> {
    return await prisma.weekly_reports.findFirst({
      where: { userId, weekStart, weekEnd },
      select: { id: true },
    })
  }

  async create(data: {
    userId: number
    userName: string
    weekStart: Date
    weekEnd: Date
    totalLogs: number
    summary: string | null
  }): Promise<WeeklyReportRow> {
    return await prisma.weekly_reports.create({ data })
  }

  async update(id: number, data: { userName: string; totalLogs: number; summary: string }): Promise<WeeklyReportRow> {
    return await prisma.weekly_reports.update({ where: { id }, data })
  }

  async delete(id: number): Promise<void> {
    await prisma.weekly_reports.delete({ where: { id } })
  }
}
