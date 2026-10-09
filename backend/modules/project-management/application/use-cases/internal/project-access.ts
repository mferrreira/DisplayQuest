import { canActorManageProjectDecision } from "@/backend/domain"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"

/**
 * resolveCanActorManageProject — OND5-B2. The frozen canActorManageProject flow
 * (project-management.gateway.ts:159-169): membership first (its roles decide, QUIRK:
 * global roles are NOT consulted when a membership exists), otherwise the actor's global
 * MANAGE_USERS; unknown actor -> false.
 */
export async function resolveCanActorManageProject(
  dependencies: { memberships: ProjectManagementMembershipPort; actors: ProjectActorsPort },
  projectId: number,
  actorId: number,
): Promise<boolean> {
  const membership = await dependencies.memberships.findMembership(projectId, actorId)
  if (membership !== null) {
    return canActorManageProjectDecision(membership.roles, null)
  }

  const actor = await dependencies.actors.findActor(actorId)
  return canActorManageProjectDecision(null, actor ? actor.roles : null)
}
