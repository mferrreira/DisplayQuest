import { ForbiddenError, NotFoundError, canActorAccessProjectDecision } from "@/backend/domain"
import type { ListProjectDeliverableFilesQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectDeliverablesPort } from "@/backend/modules/project-management/application/ports/project-deliverables.repository"
import type { ProjectDeliverableFilesPort } from "@/backend/modules/project-management/application/ports/project-deliverable-files.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * ListProjectDeliverableFilesUseCase — S02 (plan-v21). Lê só o metadado; nenhum byte de bucket
 * é tocado aqui. A leitura é a decisão do projeto (DEC-136: aberta ao autenticado), e o
 * entregável de outro projeto é 404, não lista vazia.
 */
export interface ListProjectDeliverableFilesDependencies {
  projects: ProjectRepositoryPort
  deliverables: ProjectDeliverablesPort
  files: ProjectDeliverableFilesPort
}

export class ListProjectDeliverableFilesUseCase {
  constructor(private readonly dependencies: ListProjectDeliverableFilesDependencies) {}

  async execute(query: ListProjectDeliverableFilesQuery) {
    const project = await this.dependencies.projects.findById(query.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    if (!canActorAccessProjectDecision(query.actorId)) {
      throw new ForbiddenError("Usuário não tem acesso a este projeto")
    }

    const deliverable = await this.dependencies.deliverables.findById(query.deliverableId)
    if (!deliverable || deliverable.projectId !== query.projectId) {
      throw new NotFoundError("Entregável não encontrado")
    }

    return await this.dependencies.files.listByDeliverable(deliverable.id)
  }
}
