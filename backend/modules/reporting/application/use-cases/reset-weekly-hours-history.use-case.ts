import { requireActorPermission } from "@/backend/domain/identity"
import { formatWeekDate, hoursFromDurations, weekWindowFor } from "@/backend/domain/reporting"
import type { ActorRef } from "@/backend/domain"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port"
import type { WeeklyHoursHistoryRepository } from "@/backend/modules/reporting/application/ports/weekly-hours-history.repository"
import { WEEKLY_HOURS_DENIED_MESSAGE } from "@/backend/modules/reporting/application/use-cases/list-weekly-hours-history.use-case"

/**
 * OND7-B3 — frozen from resetWeeklyHoursHistory (gateway:351-408). QUIRK-7C: NO dedup
 * (repeated runs create duplicate history rows); currentWeekHours is zeroed for EVERY active
 * user even with 0h; savedHours is the toFixed(1) string.
 *
 * B6-3 (D4): este use case tem DOIS donos (a família do DEC-54): a rota
 * POST /api/weekly-hours-history (pessoa com MANAGE_USERS, mensagem própria) e o cron
 * semanal de `lib/services/cron-service.ts`, que agora passa `systemActor("WEEKLY_RESET")`
 * — o bypass declarado. Sem o ator-de-sistema, o gate derrubava o cron em produção
 * (nenhum teste de rota exercitaria isso).
 */
export class ResetWeeklyHoursHistoryUseCase {
  constructor(
    private readonly hoursRead: HoursReadRepository,
    private readonly weeklyHoursHistory: WeeklyHoursHistoryRepository,
    private readonly directory: ReportingDirectory,
  ) {}

  async execute(actor: ActorRef): Promise<Array<{
    userId: number
    userName: string
    savedHours: string
    weekStart: string
    weekEnd: string
  }>> {
    requireActorPermission(actor, "MANAGE_USERS", WEEKLY_HOURS_DENIED_MESSAGE)

    const users = await this.directory.findActiveUsers()
    const { start: currentWeekStart, end: currentWeekEnd } = weekWindowFor(new Date())

    const results = []

    for (const user of users) {
      const sessions = await this.hoursRead.findCompletedDurations({
        userId: user.id,
        gte: currentWeekStart,
        lte: currentWeekEnd,
      })

      const totalHours = hoursFromDurations(sessions)

      if (totalHours > 0) {
        await this.weeklyHoursHistory.create({
          userId: user.id,
          userName: user.name,
          weekStart: currentWeekStart,
          weekEnd: currentWeekEnd,
          totalHours,
        })

        results.push({
          userId: user.id,
          userName: user.name,
          savedHours: totalHours.toFixed(1),
          weekStart: formatWeekDate(currentWeekStart),
          weekEnd: formatWeekDate(currentWeekEnd),
        })
      }

      await this.directory.resetCurrentWeekHours(user.id)
    }

    return results
  }
}
