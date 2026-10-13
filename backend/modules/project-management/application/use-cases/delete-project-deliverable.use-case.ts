import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { DeleteProjectDeliverableCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectDeliverablesPort } from "@/backend/modules/project-management/application/ports/project-deliverables.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * DeleteProjectDeliverableUseCase — V5-2c. Mesmo gate dos demais: 404 de projeto, 403 de
 * gestão, 404 de entregável (inclusive quando o id existe mas é de outro projeto).
 */
export interface DeleteProjectDeliverableDependencies {
  projects: ProjectRepositoryPort
  deliverables: ProjectDeliverablesPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class DeleteProjectDeliverableUseCase {
  constructor(private readonly dependencies: DeleteProjectDeliverableDependencies) {}

  async execute(command: DeleteProjectDeliverableCommand) {
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
      throw new ForbiddenError("Usuário não tem permissão para gerenciar este projeto")
    }

    const deliverable = await this.dependencies.deliverables.findById(command.deliverableId)
    if (!deliverable || deliverable.projectId !== command.projectId) {
      throw new NotFoundError("Entregável não encontrado")
    }

    await this.dependencies.deliverables.delete(deliverable.id)
    return { id: deliverable.id }
  }
}
