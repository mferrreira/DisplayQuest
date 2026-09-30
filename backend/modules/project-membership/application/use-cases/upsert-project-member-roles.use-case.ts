import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  canManageProjectMembers,
  normalizeRoles,
} from "@/backend/domain"
import type { CreatedProjectMemberView, UpsertProjectMemberRolesCommand } from "@/backend/modules/project-membership/application/contracts"
import type { ProjectAccessPort } from "@/backend/modules/project-membership/application/ports/project-access.port"
import type { ProjectMembershipRepositoryPort } from "@/backend/modules/project-membership/application/ports/project-membership.repository"

/**
 * UpsertProjectMemberRolesUseCase — OND5-B2 (R2). Frozen from the legacy gateway (:148-203):
 * manage gate -> project/user exist -> normalizeRoles -> REPLACE roles when the membership
 * exists, CREATE it otherwise.
 */
export interface UpsertProjectMemberRolesDependencies {
  memberships: ProjectMembershipRepositoryPort
  access: ProjectAccessPort
}

export class UpsertProjectMemberRolesUseCase {
  constructor(private readonly dependencies: UpsertProjectMemberRolesDependencies) {}

  async execute(command: UpsertProjectMemberRolesCommand): Promise<CreatedProjectMemberView> {
    const actorMembership = await this.dependencies.memberships.findMembership(command.projectId, command.actorUserId)
    if (!canManageProjectMembers(command.actorRoles, actorMembership?.roles ?? null)) {
      throw new ForbiddenError("Apenas coordenadores, gerentes ou gerente do projeto podem atualizar papéis")
    }

    if (!(await this.dependencies.access.projectExists(command.projectId))) {
      throw new NotFoundError("Projeto não encontrado")
    }

    if (!(await this.dependencies.access.userExists(command.targetUserId))) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const roles = normalizeRoles(command.roles)
    if (roles.length === 0) {
      throw new ValidationError("Nenhum papel válido informado")
    }

    const existingMembership = await this.dependencies.memberships.findMembership(command.projectId, command.targetUserId)

    const membership = existingMembership
      ? await this.dependencies.memberships.updateMembershipRoles(existingMembership.id, roles)
      : await this.dependencies.memberships.createMembership({
          projectId: command.projectId,
          userId: command.targetUserId,
          roles,
        })

    return {
      id: membership.id,
      userId: membership.userId,
      userName: membership.userName,
      userEmail: membership.userEmail,
      roles: membership.roles,
      joinedAt: membership.joinedAt.toISOString(),
    }
  }
}
