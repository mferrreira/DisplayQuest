import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { ListProjectDeliverablesQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectDeliverablesPort } from "@/backend/modules/project-management/application/ports/project-deliverables.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorAccessProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * ListProjectDeliverablesUseCase — V5-2c. Ordem congelada com a dos demais use cases do
 * módulo: projeto inexistente -> 404; sem acesso -> 403; só então a leitura.
 *
 * A autorização é a MESMA decisão da leitura do projeto (`resolveCanActorAccessProject`):
 * entregável é parte do projeto, não um recurso com regra própria.
 */
export interface ListProjectDeliverablesDependencies {
  projects: ProjectRepositoryPort
  deliverables: ProjectDeliverablesPort
  actors: ProjectActorsPort
}

export class ListProjectDeliverablesUseCase {
  constructor(private readonly dependencies: ListProjectDeliverablesDependencies) {}

  async execute(query: ListProjectDeliverablesQuery) {
    const project = await this.dependencies.projects.findById(query.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    const canAccess = await resolveCanActorAccessProject(
      { actors: this.dependencies.actors },
      query.projectId,
      query.actorId,
      query.actorRoles,
    )
    if (!canAccess) {
      throw new ForbiddenError("Usuário não tem acesso a este projeto")
    }

    return await this.dependencies.deliverables.listByProjectId(query.projectId)
  }
}
