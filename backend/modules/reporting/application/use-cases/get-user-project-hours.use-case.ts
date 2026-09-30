import { aggregateProjectHours, hoursTimeWindow } from "@/backend/domain/reporting"
import type { UserProjectHoursQuery } from "@/backend/modules/reporting/application/contracts"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port"

/**
 * OND7-B3 — frozen from getUserProjectHours (gateway:235-266): iterate the user's
 * memberships, aggregate each project's hours (QUIRK-7A window semantics inherited), pick the
 * actor's own entry from hoursByUser.
 */
export class GetUserProjectHoursUseCase {
  constructor(
    private readonly hoursRead: HoursReadRepository,
    private readonly directory: ReportingDirectory,
  ) {}

  async execute(query: UserProjectHoursQuery): Promise<Array<{
    projectId: number
    projectName: string
    projectStatus: string
    userHours: number
    projectTotalHours: number
    sessionCount: number
    userSessions: unknown[]
  }>> {
    const memberships = await this.directory.findMemberships(query.userId)

    const projectsWithHours = []

    for (const membership of memberships) {
      if (!membership.project) continue

      const window = hoursTimeWindow(
        query.weekStart ? new Date(query.weekStart) : undefined,
        query.weekEnd ? new Date(query.weekEnd) : undefined,
      )

      const sessions = await this.hoursRead.findCompletedWithRelations({
        projectId: membership.project.id,
        gte: window?.gte,
        lte: window?.lte,
      })
      const projectHours = aggregateProjectHours(membership.project.id, sessions)

      const userHours = projectHours.hoursByUser.find((entry) => entry.userId === query.userId)

      projectsWithHours.push({
        projectId: membership.project.id,
        projectName: membership.project.name,
        projectStatus: membership.project.status,
        userHours: userHours?.totalHours || 0,
        projectTotalHours: projectHours.totalHours,
        sessionCount: userHours?.sessions?.length || 0,
        userSessions: userHours?.sessions || [],
      })
    }

    return projectsWithHours
  }
}
