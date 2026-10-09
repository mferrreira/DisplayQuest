import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  canManageProjectMembers,
  normalizeRoles,
} from "@/backend/domain"
import type { AddProjectMemberCommand, CreatedProjectMemberView } from "@/backend/modules/project-membership/application/contracts"
import type { ProjectAccessPort } from "@/backend/modules/project-membership/application/ports/project-access.port"
import type { ProjectMembershipRepositoryPort } from "@/backend/modules/project-membership/application/ports/project-membership.repository"

/**
 * AddProjectMemberUseCase — OND5-B2 (R2). Order frozen from the legacy gateway (:89-146):
 * manage gate -> roles presence -> project exists -> user exists -> normalizeRoles ->
 * duplicate rejection -> create.
 */
export interface AddProjectMemberDependencies {
  memberships: ProjectMembershipRepositoryPort
  access: ProjectAccessPort
}

export class AddProjectMemberUseCase {
  constructor(private readonly dependencies: AddProjectMemberDependencies) {}

  async execute(command: AddProjectMemberCommand): Promise<CreatedProjectMemberView> {
    const actorMembership = await this.dependencies.memberships.findMembership(command.projectId, command.actorUserId)
    if (!canManageProjectMembers(command.actorRoles, actorMembership?.roles ?? null)) {
      throw new ForbiddenError("Apenas coordenadores, gerentes ou gerente do projeto podem adicionar membros")
    }

    if (!command.roles || command.roles.length === 0) {
      throw new ValidationError("userId e roles são obrigatórios")
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
    if (existingMembership) {
      throw new ConflictError("Usuário já é membro deste projeto")
    }

    const membership = await this.dependencies.memberships.createMembership({
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
