import { prisma } from "@/lib/database/prisma"
import type { UserStatsPort } from "@/backend/modules/gamification/application/ports/user-stats.port"

/**
 * OND6-B2 (R1) — amostras brutas das estatisticas de badge. Queries + swallow
 * congelados dos metodos correspondentes de UserRepository (:321-400): contagens
 * com try/catch -> 0, amostras com try/catch -> [] (a regra pura agrega: media das
 * 4 semanas mais novas e streak maximo de dias).
 */
export function createPrismaUserStatsPort(): UserStatsPort {
  return {
    async projectsCount(userId) {
      try {
        return await prisma.project_members.count({ where: { userId } })
      } catch (error) {
        console.error(`Error getting projects count for user ${userId}:`, error)
        return 0
      }
    },
    async workSessionsCount(userId) {
      try {
        return await prisma.work_sessions.count({ where: { userId } })
      } catch (error) {
        console.error(`Error getting work sessions count for user ${userId}:`, error)
        return 0
      }
    },
    async weeklyHoursSamples(userId) {
      try {
        const rows = await prisma.weekly_hours_history.findMany({
          where: { userId },
          orderBy: { weekStart: "desc" },
          take: 4,
        })
        return rows.map((row) => ({ totalHours: row.totalHours }))
      } catch (error) {
        console.error(`Error getting average weekly hours for user ${userId}:`, error)
        return []
      }
    },
    async dailyLogDates(userId) {
      try {
        const rows = await prisma.daily_logs.findMany({
          where: { userId },
          orderBy: { date: "asc" },
        })
        return rows.map((row) => row.date)
      } catch (error) {
        console.error(`Error getting max consecutive days for user ${userId}:`, error)
        return []
      }
    },
  }
}
