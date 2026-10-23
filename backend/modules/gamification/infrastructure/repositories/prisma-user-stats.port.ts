import { prisma } from "@/lib/database/prisma"
import { seasonMonthPrefix } from "@/backend/domain"
import type { UserStatsPort } from "@/backend/modules/gamification/application/ports/user-stats.port"

/**
 * OND6-B2 (R1) — amostras brutas das estatisticas de badge. Queries + swallow
 * congelados dos metodos correspondentes de UserRepository (:321-400): contagens
 * com try/catch -> 0, amostras com try/catch -> [] (a regra pura agrega: media das
 * 4 semanas mais novas e streak maximo de dias).
 *
 * V8-6 (DEC-219) acrescenta as duas leituras que as janelas novas dos criterios pedem:
 *   - `countTasksCompletedSince` sao as MESMAS duas familias do fechamento mensal (V8-2) e do
 *     XP semanal (V8-3) — a mesma condicao de visibilidade nos tres lugares, guardada por teste
 *     (`trophy-window-guard.test.ts`), porque tres contas de "tarefas do mes" que divergem fazem o
 *     critério, o placar e a revisao de XP contarem populacoes diferentes.
 *   - `closedSeasonSums` soma `month_history` do ano pelo prefixo que o dominio nomeia
 *     (`seasonMonthPrefix`) — um `LIKE '2026%'` escrito a mao e o mesmo erro da DEC-90/96.
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
    async countTasksCompletedSince(userId, { start, endExclusive }) {
      try {
        const [progressos, delegadasAprovadas] = await Promise.all([
          prisma.task_user_progress.count({
            where: { userId, completedAt: { gte: start, lt: endExclusive } },
          }),
          prisma.tasks.count({
            where: {
              assignedTo: userId,
              completedAt: { gte: start, lt: endExclusive },
              isGlobal: false,
              taskVisibility: { not: "public" },
            },
          }),
        ])
        return progressos + delegadasAprovadas
      } catch (error) {
        console.error(`Error counting tasks completed in window for user ${userId}:`, error)
        return 0
      }
    },
    async closedSeasonSums(userId, year) {
      try {
        const rows = await prisma.month_history.findMany({
          where: { userId, month: { startsWith: seasonMonthPrefix(year) } },
          select: { points: true, completedTasks: true },
        })
        return rows.reduce(
          (sums, row) => ({ points: sums.points + row.points, completedTasks: sums.completedTasks + row.completedTasks }),
          { points: 0, completedTasks: 0 },
        )
      } catch (error) {
        console.error(`Error summing closed months of season for user ${userId}:`, error)
        return { points: 0, completedTasks: 0 }
      }
    },
  }
}
