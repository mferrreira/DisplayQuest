import { ForbiddenError, NotFoundError, canActorAccessProjectDecision } from "@/backend/domain"
import type { GetProjectDeliverableFileQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectDeliverablesPort } from "@/backend/modules/project-management/application/ports/project-deliverables.repository"
import type { ProjectDeliverableFilesPort } from "@/backend/modules/project-management/application/ports/project-deliverable-files.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * GetProjectDeliverableFileUseCase — S02 (plan-v21). O metadado do arquivo que a rota de binário
 * vai servir: a rota checa aqui que o arquivo existe e pertence àquele entregável daquele
 * projeto, e só então lê o objeto no bucket pela chave do registro (mesma ordem medida do anexo
 * e da prova, DEC-133).
 */
export interface GetProjectDeliverableFileDependencies {
  projects: ProjectRepositoryPort
  deliverables: ProjectDeliverablesPort
  files: ProjectDeliverableFilesPort
}

export class GetProjectDeliverableFileUseCase {
  constructor(private readonly dependencies: GetProjectDeliverableFileDependencies) {}

  async execute(query: GetProjectDeliverableFileQuery) {
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

    const file = await this.dependencies.files.findById(query.fileId)
    if (!file || file.deliverableId !== deliverable.id) {
      throw new NotFoundError("Arquivo não encontrado")
    }

    return file
  }
}
