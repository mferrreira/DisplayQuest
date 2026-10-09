import { prisma } from "@/lib/database/prisma"
import type {
  AggregateDailyLogRow,
  AggregateSessionRow,
  CompletedSessionRow,
  HoursReadRepository,
  SessionDurationRow,
} from "@/backend/modules/reporting/application/ports/hours-read.repository"

/**
 * OND7-B3 — thin Prisma read adapter over `work_sessions` + `daily_logs`.
 * `findCompletedWithRelations` reproduces the legacy `findCompletedSessions` include/orderBy
 * verbatim (gateway:516-580) so the read models stay byte-identical.
 */
export class PrismaHoursReadRepository implements HoursReadRepository {
  async countCompleted(query: {
    userId?: number
    projectId?: number
    gte?: Date
    lte?: Date
  }): Promise<number> {
    return await prisma.work_sessions.count({
      where: {
        status: "completed",
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.gte && query.lte ? { startTime: { gte: query.gte, lte: query.lte } } : {}),
      },
    })
  }

  async findCompletedWithRelations(query: {
    userId?: number
    projectId?: number
    gte?: Date
    lte?: Date
  }): Promise<CompletedSessionRow[]> {
    const rows = await prisma.work_sessions.findMany({
      where: {
        status: "completed",
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.gte && query.lte ? { startTime: { gte: query.gte, lte: query.lte } } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        dailyLog: { select: { id: true, note: true, date: true } },
        tasks: {
          include: {
            task: {
              select: { id: true, title: true, completed: true, projectId: true, points: true },
            },
          },
        },
      },
      orderBy: { startTime: "desc" },
    })

    // QUIRK-7H frozen: the RAW rows (with the full sessionTask join rows in `tasks`) are
    // what hoursByUser[].sessions leaks into the read model — no mapping here on purpose.
    return rows
  }

  async findCompletedDurations(query: { userId: number; gte: Date; lte: Date }): Promise<SessionDurationRow[]> {
    return await prisma.work_sessions.findMany({
      where: {
        userId: query.userId,
        status: "completed",
        startTime: { gte: query.gte, lte: query.lte },
      },
      select: { duration: true },
    })
  }

  async findAllSessionsInWindow(query: { projectId: number; gte: Date; lte: Date }): Promise<AggregateSessionRow[]> {
    // NO status filter — QUIRK-7D frozen from aggregateProjectReport (gateway:934-937).
    return await prisma.work_sessions.findMany({
      where: { projectId: query.projectId, startTime: { gte: query.gte, lte: query.lte } },
      orderBy: { startTime: "desc" },
    })
  }

  async findDailyLogsInWindow(query: { projectId: number; gte: Date; lte: Date }): Promise<AggregateDailyLogRow[]> {
    return await prisma.daily_logs.findMany({
      where: { projectId: query.projectId, date: { gte: query.gte, lte: query.lte } },
      include: {
        user: { select: { name: true } },
        project: { select: { name: true } },
        workSession: { select: { startTime: true, endTime: true } },
      },
      orderBy: { date: "desc" },
    })
  }
}
