import {
  ForbiddenError,
  canViewProjectMembers,
  toMemberView,
  weekWindow,
} from "@/backend/domain"
import type { ListProjectMembersQuery, ProjectMemberView } from "@/backend/modules/project-membership/application/contracts"
import type { ProjectAccessPort } from "@/backend/modules/project-membership/application/ports/project-access.port"
import type { ProjectHoursPort } from "@/backend/modules/project-membership/application/ports/project-hours.port"
import type { ProjectMembershipRepositoryPort } from "@/backend/modules/project-membership/application/ports/project-membership.repository"

/**
 * ListProjectMembersUseCase — OND5-B2 (R2). Rules moved out of the legacy gateway
 * (prisma-project-membership.gateway.ts:19-87): view gate (global OR any membership),
 * joinedAt DESC rows, total/week hours = SUM(completed duration)/3600 rounded to 2 decimals
 * over the Monday-based LOCAL week window. Behavior frozen by golden OND5-B1.
 */
export interface ListProjectMembersDependencies {
  memberships: ProjectMembershipRepositoryPort
  hours: ProjectHoursPort
}

export class ListProjectMembersUseCase {
  constructor(private readonly dependencies: ListProjectMembersDependencies) {}

  async execute(query: ListProjectMembersQuery): Promise<ProjectMemberView[]> {
    const actorMembership = await this.dependencies.memberships.findMembership(query.projectId, query.actorUserId)
    if (!canViewProjectMembers(query.actorRoles, Boolean(actorMembership))) {
      throw new ForbiddenError("Acesso negado ao projeto")
    }

    const members = await this.dependencies.memberships.listMembersWithUser(query.projectId)

    const totals = await this.dependencies.hours.sumCompletedSecondsByUser(query.projectId)
    const { start, end } = weekWindow(new Date())
    const weekTotals = await this.dependencies.hours.sumCompletedSecondsByUser(query.projectId, { start, end })

    const totalSecondsByUser = new Map<number, number>(totals.map((row) => [row.userId, row.seconds]))
    const weekSecondsByUser = new Map<number, number>(weekTotals.map((row) => [row.userId, row.seconds]))

    return members.map((member) =>
      toMemberView(member, totalSecondsByUser.get(member.userId) ?? 0, weekSecondsByUser.get(member.userId) ?? 0),
    )
  }
}
