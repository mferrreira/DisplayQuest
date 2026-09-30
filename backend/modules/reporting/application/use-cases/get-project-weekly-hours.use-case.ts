import { aggregateProjectHours, projectWeeklyHoursWindow } from "@/backend/domain/reporting"
import type { ProjectHoursResult } from "@/backend/modules/reporting/application/contracts"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"

/**
 * OND7-B3 — frozen from getProjectWeeklyHours (gateway:189-198). QUIRK-7L: weekStart is NOT
 * normalized to Monday — the window starts at the raw instant and ends at endOfWeek(raw).
 */
export class GetProjectWeeklyHoursUseCase {
  constructor(private readonly hoursRead: HoursReadRepository) {}

  async execute(projectId: number, weekStart: string): Promise<ProjectHoursResult> {
    const window = projectWeeklyHoursWindow(new Date(weekStart))

    const sessions = await this.hoursRead.findCompletedWithRelations({
      projectId,
      gte: window.gte,
      lte: window.lte,
    })

    return aggregateProjectHours(projectId, sessions) as ProjectHoursResult
  }
}
