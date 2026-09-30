import { ConflictError, ForbiddenError, NotFoundError, canDeleteProjectStatus } from "@/backend/domain"
import type { DeleteProjectCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * DeleteProjectUseCase — OND5-B2 (R2). Frozen from the legacy gateway (:140-157):
 * not-found -> manage gate -> status gate (only active/archived/on_hold; completed CANNOT).
 */
export interface DeleteProjectDependencies {
  projects: ProjectRepositoryPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class DeleteProjectUseCase {
  constructor(private readonly dependencies: DeleteProjectDependencies) {}

  async execute(command: DeleteProjectCommand) {
    const project = await this.dependencies.projects.findById(command.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    const canManage = await resolveCanActorManageProject(
      { memberships: this.dependencies.memberships, actors: this.dependencies.actors },
      command.projectId,
      command.actorId,
    )
    if (!canManage) {
      throw new ForbiddenError("Usuário não tem permissão para excluir este projeto")
    }

    if (!canDeleteProjectStatus(project.status)) {
      throw new ConflictError("Projeto não pode ser excluído no status atual")
    }

    await this.dependencies.projects.delete(command.projectId)
  }
}
