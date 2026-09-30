import { weeklyHistoryWindow } from "@/backend/domain/reporting"
import type { WeeklyHoursHistoryItem, WeeklyHoursHistoryQuery } from "@/backend/modules/reporting/application/contracts"
import type { WeeklyHoursHistoryRepository } from "@/backend/modules/reporting/application/ports/weekly-hours-history.repository"

/**
 * OND7-B3 — frozen from listWeeklyHoursHistory (gateway:268-313). QUIRK-7B: with weekStart
 * the window is [startOfWeek, endOfWeek) (`lt`) and the ordering flips to totalHours desc;
 * without it, weekStart desc. user null -> user undefined in the item.
 */
export class ListWeeklyHoursHistoryUseCase {
  constructor(private readonly weeklyHoursHistory: WeeklyHoursHistoryRepository) {}

  async execute(query: WeeklyHoursHistoryQuery): Promise<WeeklyHoursHistoryItem[]> {
    const window = query.weekStart ? weeklyHistoryWindow(new Date(query.weekStart)) : undefined

    const history = await this.weeklyHoursHistory.findMany({
      userId: query.userId,
      window,
      orderBy: query.weekStart ? "totalHours" : "weekStart",
    })

    return history.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      userName: entry.userName,
      weekStart: entry.weekStart.toISOString(),
      weekEnd: entry.weekEnd.toISOString(),
      totalHours: entry.totalHours,
      createdAt: entry.createdAt.toISOString(),
      user: entry.user
        ? {
            id: entry.user.id,
            name: entry.user.name,
            email: entry.user.email,
            roles: entry.user.roles,
          }
        : undefined,
    }))
  }
}
