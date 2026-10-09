import { canActorAccessProjectDecision, hasPermission } from "@/backend/domain"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"

/**
 * CanActorAccessProjectUseCase — OND5-B2 (R2). The decision is
 * domain/canActorAccessProjectDecision (MANAGE_USERS/MANAGE_PROJECTS bypass -> membership
 * -> leader/creator). Global roles short-circuit BEFORE any read (frozen: the legacy
 * gateway touched no table for managers).
 */
export interface CanActorAccessProjectDependencies {
  actors: ProjectActorsPort
}

export class CanActorAccessProjectUseCase {
  constructor(private readonly dependencies: CanActorAccessProjectDependencies) {}

  async execute(projectId: number, actorId: number, actorRoles: unknown) {
    if (hasPermission(actorRoles, "MANAGE_USERS") || hasPermission(actorRoles, "MANAGE_PROJECTS")) {
      return true
    }

    const membershipExists = await this.dependencies.actors.membershipExists(projectId, actorId)
    const relation = await this.dependencies.actors.findProjectRelation(projectId)

    return canActorAccessProjectDecision(actorRoles, actorId, membershipExists, relation)
  }
}
