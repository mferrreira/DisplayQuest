import { ForbiddenError, NotFoundError, canActorAccessProjectDecision } from "@/backend/domain"
import type { ListProjectDeliverablesQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectDeliverablesPort } from "@/backend/modules/project-management/application/ports/project-deliverables.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * ListProjectDeliverablesUseCase — V5-2c. Ordem congelada com a dos demais use cases do
 * módulo: projeto inexistente -> 404; sem ator -> 403; só então a leitura.
 *
 * A autorização é a MESMA decisão da leitura do projeto (`canActorAccessProjectDecision`):
 * entregável é parte do projeto, não um recurso com regra própria. No V5-2a (DEC-127) essa
 * decisão passou a ser "qualquer autenticado lê", e o `actors` saiu das dependências porque a
 * leitura deixou de consultar membership e líder/criador.
 */
export interface ListProjectDeliverablesDependencies {
  projects: ProjectRepositoryPort
  deliverables: ProjectDeliverablesPort
}

export class ListProjectDeliverablesUseCase {
  constructor(private readonly dependencies: ListProjectDeliverablesDependencies) {}

  async execute(query: ListProjectDeliverablesQuery) {
    const project = await this.dependencies.projects.findById(query.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    if (!canActorAccessProjectDecision(query.actorId)) {
      throw new ForbiddenError("Usuário não tem acesso a este projeto")
    }

    return await this.dependencies.deliverables.listByProjectId(query.projectId)
  }
}
