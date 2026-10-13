import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { RemoveProjectAttachmentCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectAttachmentsPort } from "@/backend/modules/project-management/application/ports/project-attachments.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * RemoveProjectAttachmentUseCase — V5-2c. Devolve o registro apagado: é a rota que remove o
 * objeto do bucket (pelo seam), e precisa da `blobKey` para isso. O use case não conhece
 * bucket nenhum — mesma separação do `add`.
 */
export interface RemoveProjectAttachmentDependencies {
  projects: ProjectRepositoryPort
  attachments: ProjectAttachmentsPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class RemoveProjectAttachmentUseCase {
  constructor(private readonly dependencies: RemoveProjectAttachmentDependencies) {}

  async execute(command: RemoveProjectAttachmentCommand) {
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

    const attachment = await this.dependencies.attachments.findById(command.attachmentId)
    if (!attachment || attachment.projectId !== command.projectId) {
      throw new NotFoundError("Anexo não encontrado")
    }

    await this.dependencies.attachments.delete(attachment.id)
    return attachment
  }
}
