import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { ListProjectAttachmentsQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectAttachmentsPort } from "@/backend/modules/project-management/application/ports/project-attachments.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorAccessProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * ListProjectAttachmentsUseCase — V5-2c. Lê só o metadado; nenhum byte de bucket é tocado
 * aqui, então a listagem funciona sem bucket no ar (mesma postura da suíte de unit do seam).
 */
export interface ListProjectAttachmentsDependencies {
  projects: ProjectRepositoryPort
  attachments: ProjectAttachmentsPort
  actors: ProjectActorsPort
}

export class ListProjectAttachmentsUseCase {
  constructor(private readonly dependencies: ListProjectAttachmentsDependencies) {}

  async execute(query: ListProjectAttachmentsQuery) {
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

    return await this.dependencies.attachments.listByProjectId(query.projectId)
  }
}
