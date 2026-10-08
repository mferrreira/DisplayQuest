import { requireActorPermission } from "@/backend/domain/identity"
import { formatWeekDate, rollingWeekWindows, sumWeeklyHours, TOP_USERS_LIMIT, weekWindowFor } from "@/backend/domain/reporting"
import type { ActorRef } from "@/backend/domain"
import type { WeeklyHoursHistoryItem } from "@/backend/modules/reporting/application/contracts"
import type { WeeklyHoursHistoryRepository } from "@/backend/modules/reporting/application/ports/weekly-hours-history.repository"
import { WEEKLY_HOURS_DENIED_MESSAGE } from "@/backend/modules/reporting/application/use-cases/list-weekly-hours-history.use-case"

/**
 * OND7-B3 — frozen from getWeeklyHoursStats (gateway:315-349): current week (Monday-based)
 * with totalHours/userCount/topUsers (5 first of the totalHours-desc ordering) + last4Weeks
 * i=1..4 over subWeeks(now, i) windows.
 *
 * B6-3 (D4): mesmo gate MANAGE_USERS puro e a MESMA mensagem do histórico de horas — as duas
 * leituras vivem na rota /api/weekly-hours-history e compartilhavam o `ensurePermission`.
 */
export class GetWeeklyHoursStatsUseCase {
  constructor(private readonly weeklyHoursHistory: WeeklyHoursHistoryRepository) {}

  async execute(actor: ActorRef): Promise<{
    currentWeek: {
      weekStart: string
      weekEnd: string
      totalHours: number
      userCount: number
      topUsers: WeeklyHoursHistoryItem[]
    }
    last4Weeks: Array<{
      weekStart: string
      weekEnd: string
      totalHours: number
      userCount: number
    }>
  }> {
    requireActorPermission(actor, "MANAGE_USERS", WEEKLY_HOURS_DENIED_MESSAGE)

    const now = new Date()
    const currentWeek = weekWindowFor(now)

    const currentWeekHistory = await this.weeklyHoursHistory.findMany({
      window: { gte: currentWeek.start, lt: currentWeek.end },
      orderBy: "totalHours",
    })

    const laterWeeks = rollingWeekWindows(now, 5).slice(1)
    const last4Weeks = []
    for (const window of laterWeeks) {
      const weekHistory = await this.weeklyHoursHistory.findMany({
        window: { gte: window.start, lt: window.end },
        orderBy: "totalHours",
      })

      last4Weeks.push({
        weekStart: formatWeekDate(window.start),
        weekEnd: formatWeekDate(window.end),
        totalHours: sumWeeklyHours(weekHistory),
        userCount: weekHistory.length,
      })
    }

    const topUsers: WeeklyHoursHistoryItem[] = currentWeekHistory.slice(0, TOP_USERS_LIMIT).map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      userName: entry.userName,
      weekStart: entry.weekStart.toISOString(),
      weekEnd: entry.weekEnd.toISOString(),
      totalHours: entry.totalHours,
      createdAt: entry.createdAt.toISOString(),
      user: entry.user
        ? { id: entry.user.id, name: entry.user.name, email: entry.user.email, roles: entry.user.roles }
        : undefined,
    }))

    return {
      currentWeek: {
        weekStart: formatWeekDate(currentWeek.start),
        weekEnd: formatWeekDate(currentWeek.end),
        totalHours: sumWeeklyHours(currentWeekHistory),
        userCount: currentWeekHistory.length,
        topUsers,
      },
      last4Weeks,
    }
  }
}
