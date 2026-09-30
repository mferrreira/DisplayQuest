import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  canManageProjectMembers,
} from "@/backend/domain"
import type { RemoveProjectMemberCommand } from "@/backend/modules/project-membership/application/contracts"
import type { ProjectMembershipRepositoryPort } from "@/backend/modules/project-membership/application/ports/project-membership.repository"

/**
 * RemoveProjectMemberUseCase — OND5-B2 (R2). Frozen from the legacy gateway (:255-295):
 * manage gate -> membership lookup scoped to the project -> last-GERENTE_PROJETO guard
 * (counted by MEMBERSHIPS, not by projects.leaderId) -> delete -> { memberName }.
 */
export interface RemoveProjectMemberDependencies {
  memberships: ProjectMembershipRepositoryPort
}

export class RemoveProjectMemberUseCase {
  constructor(private readonly dependencies: RemoveProjectMemberDependencies) {}

  async execute(command: RemoveProjectMemberCommand): Promise<{ memberName: string | null }> {
    const actorMembership = await this.dependencies.memberships.findMembership(command.projectId, command.actorUserId)
    if (!canManageProjectMembers(command.actorRoles, actorMembership?.roles ?? null)) {
      throw new ForbiddenError("Apenas coordenadores, gerentes ou gerente do projeto podem remover membros")
    }

    const membership = await this.dependencies.memberships.findMembershipById(command.membershipId, command.projectId)
    if (!membership) {
      throw new NotFoundError("Membro não encontrado no projeto")
    }

    if (membership.roles.includes("GERENTE_PROJETO")) {
      const managerCount = await this.dependencies.memberships.countMembersWithRole(command.projectId, "GERENTE_PROJETO")
      if (managerCount <= 1) {
        throw new ConflictError("Não é possível remover o último gerente do projeto")
      }
    }

    await this.dependencies.memberships.deleteMembership(command.membershipId)

    return { memberName: membership.userName }
  }
}
