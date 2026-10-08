import { requireActorPermission } from "@/backend/domain/identity"
import { formatWeekDate, hoursFromDurations, weekWindowFor } from "@/backend/domain/reporting"
import type { ActorRef } from "@/backend/domain"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port"
import type { WeeklyHoursHistoryRepository } from "@/backend/modules/reporting/application/ports/weekly-hours-history.repository"
import { WEEKLY_HOURS_DENIED_MESSAGE } from "@/backend/modules/reporting/application/use-cases/list-weekly-hours-history.use-case"

/**
 * OND7-B3 — frozen from createWeeklyHoursHistory (gateway:410-469): dedups by
 * (userId, exact normalized weekStart) — contrast with reset's NO-dedup (QUIRK-7C) — and
 * reports totalHours as a NUMBER (contrast with reset's savedHours string).
 *
 * B6-3 (D4): mesmo gate MANAGE_USERS puro e a mesma mensagem do POST /weekly-hours-history.
 */
export class CreateWeeklyHoursHistoryUseCase {
  constructor(
    private readonly hoursRead: HoursReadRepository,
    private readonly weeklyHoursHistory: WeeklyHoursHistoryRepository,
    private readonly directory: ReportingDirectory,
  ) {}

  async execute(actor: ActorRef, weekStart: string): Promise<Array<{
    userId: number
    userName: string
    totalHours: number
    weekStart: string
    weekEnd: string
  }>> {
    requireActorPermission(actor, "MANAGE_USERS", WEEKLY_HOURS_DENIED_MESSAGE)

    const { start: normalizedWeekStart, end: normalizedWeekEnd } = weekWindowFor(new Date(weekStart))

    const users = await this.directory.findActiveUsers()

    const results = []

    for (const user of users) {
      const existing = await this.weeklyHoursHistory.findByWeek(user.id, normalizedWeekStart)
      if (existing) continue

      const sessions = await this.hoursRead.findCompletedDurations({
        userId: user.id,
        gte: normalizedWeekStart,
        lte: normalizedWeekEnd,
      })

      const totalHours = hoursFromDurations(sessions)

      if (totalHours > 0) {
        await this.weeklyHoursHistory.create({
          userId: user.id,
          userName: user.name,
          weekStart: normalizedWeekStart,
          weekEnd: normalizedWeekEnd,
          totalHours,
        })

        results.push({
          userId: user.id,
          userName: user.name,
          totalHours,
          weekStart: formatWeekDate(normalizedWeekStart),
          weekEnd: formatWeekDate(normalizedWeekEnd),
        })
      }
    }

    return results
  }
}
