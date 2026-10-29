import { ForbiddenError, NotFoundError, canActorAccessProjectDecision } from "@/backend/domain"
import type { ListProjectAttachmentsQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectAttachmentsPort } from "@/backend/modules/project-management/application/ports/project-attachments.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * ListProjectAttachmentsUseCase — V5-2c. Lê só o metadado; nenhum byte de bucket é tocado
 * aqui, então a listagem funciona sem bucket no ar (mesma postura da suíte de unit do seam).
 * V5-2a (DEC-127): a leitura é a decisão do projeto, e ela não consulta tabela — o `actors` saiu.
 */
export interface ListProjectAttachmentsDependencies {
  projects: ProjectRepositoryPort
  attachments: ProjectAttachmentsPort
}

export class ListProjectAttachmentsUseCase {
  constructor(private readonly dependencies: ListProjectAttachmentsDependencies) {}

  async execute(query: ListProjectAttachmentsQuery) {
    const project = await this.dependencies.projects.findById(query.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    if (!canActorAccessProjectDecision(query.actorId)) {
      throw new ForbiddenError("Usuário não tem acesso a este projeto")
    }

    return await this.dependencies.attachments.listByProjectId(query.projectId)
  }
}
