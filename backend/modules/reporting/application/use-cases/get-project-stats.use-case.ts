import { aggregateProjectHours, weekWindowFor } from "@/backend/domain/reporting"
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository"
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port"

/**
 * OND7-B3 — frozen from getProjectStats (gateway:471-514): every project with its members +
 * the current Monday-week hours/sessions per project.
 */
export class GetProjectStatsUseCase {
  constructor(
    private readonly hoursRead: HoursReadRepository,
    private readonly directory: ReportingDirectory,
  ) {}

  async execute(): Promise<Array<{
    projectId: number
    projectName: string
    projectStatus: string
    memberCount: number
    currentWeekHours: number
    currentWeekSessions: number
    members: Array<{ userId: number; userName: string; roles: string[] }>
  }>> {
    const projects = await this.directory.findAllProjectsWithMembers()
    const { start: currentWeekStart, end: currentWeekEnd } = weekWindowFor(new Date())

    const stats = []
    for (const project of projects) {
      const sessions = await this.hoursRead.findCompletedWithRelations({
        projectId: project.id,
        gte: currentWeekStart,
        lte: currentWeekEnd,
      })
      const weekHours = aggregateProjectHours(project.id, sessions)

      stats.push({
        projectId: project.id,
        projectName: project.name,
        projectStatus: project.status,
        memberCount: project.members.length,
        currentWeekHours: weekHours.totalHours,
        currentWeekSessions: weekHours.sessionCount,
        members: project.members.map((member) => ({
          userId: member.userId,
          userName: member.user?.name ?? "",
          roles: member.roles,
        })),
      })
    }

    return stats
  }
}
