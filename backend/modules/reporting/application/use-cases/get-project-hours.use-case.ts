import { aggregateProjectHours, hoursTimeWindow } from "@/backend/domain/reporting"
import type { ProjectHoursQuery, ProjectHoursResult } from "@/backend/modules/reporting/application/contracts"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"

/**
 * OND7-B3 — frozen from getProjectHours (gateway:179-187): completed sessions aggregated by
 * the pure rule. QUIRK-7A: the time filter exists ONLY when both bounds are present
 * (hoursTimeWindow returns null for partial ranges).
 */
export class GetProjectHoursUseCase {
  constructor(private readonly hoursRead: HoursReadRepository) {}

  async execute(query: ProjectHoursQuery): Promise<ProjectHoursResult> {
    const window = hoursTimeWindow(
      query.weekStart ? new Date(query.weekStart) : undefined,
      query.weekEnd ? new Date(query.weekEnd) : undefined,
    )

    const sessions = await this.hoursRead.findCompletedWithRelations({
      projectId: query.projectId,
      gte: window?.gte,
      lte: window?.lte,
    })

    return aggregateProjectHours(query.projectId, sessions) as ProjectHoursResult
  }
}
