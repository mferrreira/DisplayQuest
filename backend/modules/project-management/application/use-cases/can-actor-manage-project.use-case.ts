import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * CanActorManageProjectUseCase — OND5-B2 (R2). Thin wrapper over the frozen
 * resolveCanActorManageProject flow (membership roles win when a membership exists).
 */
export interface CanActorManageProjectDependencies {
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class CanActorManageProjectUseCase {
  constructor(private readonly dependencies: CanActorManageProjectDependencies) {}

  async execute(projectId: number, actorId: number) {
    return await resolveCanActorManageProject(this.dependencies, projectId, actorId)
  }
}
