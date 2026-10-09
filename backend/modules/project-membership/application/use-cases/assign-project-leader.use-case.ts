import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  canManageProjectMembers,
  mergeRoles,
} from "@/backend/domain"
import type { AssignProjectLeaderCommand, ProjectLeaderView } from "@/backend/modules/project-membership/application/contracts"
import type { ProjectAccessPort } from "@/backend/modules/project-membership/application/ports/project-access.port"
import type { ProjectMembershipRepositoryPort } from "@/backend/modules/project-membership/application/ports/project-membership.repository"

/**
 * AssignProjectLeaderUseCase — OND5-B2 (R2). Frozen from the legacy gateway (:205-253):
 * manage gate -> project exists -> (target !== null: user exists -> single-leader conflict
 * check -> membership created with GERENTE_PROJETO when absent, GERENTE_PROJETO merged with
 * dedup when present without it) -> projects.leaderId = target (null clears, with NO
 * membership writes).
 */
export interface AssignProjectLeaderDependencies {
  memberships: ProjectMembershipRepositoryPort
  access: ProjectAccessPort
}

export class AssignProjectLeaderUseCase {
  constructor(private readonly dependencies: AssignProjectLeaderDependencies) {}

  async execute(command: AssignProjectLeaderCommand): Promise<ProjectLeaderView> {
    const actorMembership = await this.dependencies.memberships.findMembership(command.projectId, command.actorUserId)
    if (!canManageProjectMembers(command.actorRoles, actorMembership?.roles ?? null)) {
      throw new ForbiddenError("Apenas coordenadores, gerentes ou gerente do projeto podem definir líder")
    }

    if (!(await this.dependencies.access.projectExists(command.projectId))) {
      throw new NotFoundError("Projeto não encontrado")
    }

    if (command.targetUserId !== null) {
      if (!(await this.dependencies.access.userExists(command.targetUserId))) {
        throw new NotFoundError("Usuário não encontrado")
      }

      if (await this.dependencies.access.leadsAnotherProject(command.targetUserId, command.projectId)) {
        throw new ConflictError(
          "Este usuário já é líder de outro projeto. Um usuário só pode ser líder de um projeto por vez.",
        )
      }

      const existingMembership = await this.dependencies.memberships.findMembership(command.projectId, command.targetUserId)

      if (!existingMembership) {
        await this.dependencies.memberships.createMembership({
          projectId: command.projectId,
          userId: command.targetUserId,
          roles: ["GERENTE_PROJETO"],
        })
      } else if (!existingMembership.roles.includes("GERENTE_PROJETO")) {
        await this.dependencies.memberships.updateMembershipRoles(
          existingMembership.id,
          mergeRoles(existingMembership.roles, ["GERENTE_PROJETO"]),
        )
      }
    }

    const updatedProject = await this.dependencies.access.setProjectLeader(command.projectId, command.targetUserId)

    return {
      projectId: updatedProject.projectId,
      leaderId: updatedProject.leaderId,
    }
  }
}
