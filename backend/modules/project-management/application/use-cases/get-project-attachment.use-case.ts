import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { GetProjectAttachmentQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectAttachmentsPort } from "@/backend/modules/project-management/application/ports/project-attachments.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorAccessProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * GetProjectAttachmentUseCase — V5-2c. Existe para a rota que serve o arquivo: a leitura de
 * um anexo decide acesso igual à leitura do projeto (DEC-101 pede "rota de leitura de imagem
 * com a regra de acesso do projeto"), e o id é conferido **dentro do projeto** — um anexo de
 * outro projeto responde 404, não "achei e servi".
 */
export interface GetProjectAttachmentDependencies {
  projects: ProjectRepositoryPort
  attachments: ProjectAttachmentsPort
  actors: ProjectActorsPort
}

export class GetProjectAttachmentUseCase {
  constructor(private readonly dependencies: GetProjectAttachmentDependencies) {}

  async execute(query: GetProjectAttachmentQuery) {
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

    const attachment = await this.dependencies.attachments.findById(query.attachmentId)
    if (!attachment || attachment.projectId !== query.projectId) {
      throw new NotFoundError("Anexo não encontrado")
    }

    return attachment
  }
}
