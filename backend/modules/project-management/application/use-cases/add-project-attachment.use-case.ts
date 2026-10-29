import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  projectValidationMessage,
  validateProjectAttachmentMetadata,
} from "@/backend/domain"
import type { AddProjectAttachmentCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectAttachmentsPort } from "@/backend/modules/project-management/application/ports/project-attachments.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * AddProjectAttachmentUseCase — V5-2c.
 *
 * O objeto já está no bucket quando este use case roda: quem escreveu foi a rota, pelo seam
 * `lib/storage/blob-store.ts` (DEC-101), e o 403 de gestão já aconteceu antes do corpo ser
 * lido (`AssertCanManageProjectUseCase`). Aqui ficam o gate — rechechado de propósito,
 * DEC-54 — e o metadado do registro.
 *
 * Tipo e magic bytes não são decididos aqui: são do seam. Validar as duas coisas em dois
 * lugares é a receita da regra divergir (DEC-90).
 */
export interface AddProjectAttachmentDependencies {
  projects: ProjectRepositoryPort
  attachments: ProjectAttachmentsPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class AddProjectAttachmentUseCase {
  constructor(private readonly dependencies: AddProjectAttachmentDependencies) {}

  async execute(command: AddProjectAttachmentCommand) {
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

    const errors = validateProjectAttachmentMetadata({ name: command.name, size: command.size })
    if (errors.length > 0) {
      throw new ValidationError(projectValidationMessage(errors))
    }

    return await this.dependencies.attachments.create({
      projectId: command.projectId,
      blobKey: command.blobKey,
      name: String(command.name).trim(),
      contentType: command.contentType,
      size: Number(command.size),
      uploadedBy: command.actorId,
    })
  }
}
