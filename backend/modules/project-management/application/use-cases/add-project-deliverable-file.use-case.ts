import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  projectValidationMessage,
  validateProjectAttachmentMetadata,
} from "@/backend/domain"
import type { AddProjectDeliverableFileCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectDeliverablesPort } from "@/backend/modules/project-management/application/ports/project-deliverables.repository"
import type { ProjectDeliverableFilesPort } from "@/backend/modules/project-management/application/ports/project-deliverable-files.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * AddProjectDeliverableFileUseCase — S02 (plan-v21, DEC-133/134).
 *
 * O objeto já está no bucket quando este use case roda: quem escreveu foi a rota, pelo seam, e
 * o gate de gestão já aconteceu antes do corpo ser lido. Aqui o gate rechecha de propósito
 * (DEC-54) e o metadado entra. A validação de nome/tamanho é a do anexo, reusada: é a mesma
 * forma de registro, e mensagem nova para o mesmo par nome/tamanho seria a regra em duas cópias.
 */
export interface AddProjectDeliverableFileDependencies {
  projects: ProjectRepositoryPort
  deliverables: ProjectDeliverablesPort
  files: ProjectDeliverableFilesPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class AddProjectDeliverableFileUseCase {
  constructor(private readonly dependencies: AddProjectDeliverableFileDependencies) {}

  async execute(command: AddProjectDeliverableFileCommand) {
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

    const errors = validateProjectAttachmentMetadata({ name: command.name, size: command.size })
    if (errors.length > 0) {
      throw new ValidationError(projectValidationMessage(errors))
    }

    return await this.dependencies.files.create({
      deliverableId: deliverable.id,
      blobKey: command.blobKey,
      name: String(command.name).trim(),
      contentType: command.contentType,
      size: Number(command.size),
      uploadedBy: command.actorId,
    })
  }
}
