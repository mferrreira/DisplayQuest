import { ForbiddenError, hasPermission, isProjectVolunteerRole, summarizeVolunteerStats, toVolunteerEntry, weekWindow } from "@/backend/domain"
import type { GetProjectVolunteersQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectHoursPort } from "@/backend/modules/project-management/application/ports/project-hours.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * GetProjectVolunteersUseCase — OND5-B2 (R2). Gate frozen from the legacy use case
 * (MANAGE_PROJECTS role OR canActorManageProject); the stats aggregation is frozen from the
 * gateway (:171-246): VOLUNTARIO/COLABORADOR members only (joinedAt ASC), per-member
 * completed-session SUMs over the Monday-based week window, rounded views, totals over the
 * ALREADY-rounded hours.
 */
export interface GetProjectVolunteersDependencies {
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
  hours: ProjectHoursPort
}

export class GetProjectVolunteersUseCase {
  constructor(private readonly dependencies: GetProjectVolunteersDependencies) {}

  async execute(query: GetProjectVolunteersQuery) {
    const canViewAll = hasPermission(query.actorRoles, "MANAGE_PROJECTS")
    const canManageProject = await resolveCanActorManageProject(
      { memberships: this.dependencies.memberships, actors: this.dependencies.actors },
      query.projectId,
      query.actorId,
    )

    if (!canViewAll && !canManageProject) {
      throw new ForbiddenError("Acesso negado ao projeto")
    }

    const members = await this.dependencies.memberships.listMembersWithUser(query.projectId)
    const volunteersOnly = members.filter((member) => isProjectVolunteerRole(member.roles))

    const now = new Date()
    const window = weekWindow(now)

    const volunteers = []
    for (const member of volunteersOnly) {
      const totalSeconds = await this.dependencies.hours.sumCompletedSeconds(member.userId, query.projectId)
      const weekSeconds = await this.dependencies.hours.sumCompletedSeconds(member.userId, query.projectId, window)
      volunteers.push(toVolunteerEntry(member, totalSeconds, weekSeconds, now))
    }

    return {
      volunteers,
      stats: summarizeVolunteerStats(volunteers),
    }
  }
}
