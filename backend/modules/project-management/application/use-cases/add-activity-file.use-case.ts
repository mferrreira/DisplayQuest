import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  projectValidationMessage,
  validateProjectAttachmentMetadata,
} from "@/backend/domain"
import type { AddActivityFileCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActivityFilesPort } from "@/backend/modules/project-management/application/ports/project-activity-files.repository"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanRequestActivityCompletion } from "@/backend/modules/project-management/application/use-cases/internal/activity-completion-access"

/**
 * AddActivityFileUseCase — V5-7a (DEC-133/162).
 *
 * O objeto já está no bucket quando este use case roda: quem escreveu foi a rota, pelo seam, e
 * o gate já aconteceu antes do corpo ser lido (`AssertCanRequestActivityCompletionUseCase`).
 * Aqui o gate rechecha de propósito (DEC-54) e o metadado entra.
 *
 * O gate é o da fase de pedir (DEC-76): quem pode solicitar é quem pode anexar prova. Tipo e
 * magic bytes continuam sendo do seam — validar em dois lugares é a receita da DEC-90. A
 * validação de nome/tamanho é a do anexo, reusada: é a mesma forma de registro, e mensagem
 * nova para o mesmo par nome/tamanho seria a regra em duas cópias.
 */
export interface AddActivityFileDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  files: ProjectActivityFilesPort
  memberships: ProjectManagementMembershipPort
}

export class AddActivityFileUseCase {
  constructor(private readonly dependencies: AddActivityFileDependencies) {}

  async execute(command: AddActivityFileCommand) {
    const { project, canRequest } = await resolveCanRequestActivityCompletion(
      { projects: this.dependencies.projects, memberships: this.dependencies.memberships },
      command.projectId,
      command.actorId,
    )
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }
    if (!canRequest) {
      throw new ForbiddenError("Usuário não tem permissão para solicitar a conclusão desta atividade")
    }

    const activity = await this.dependencies.cronograma.findActivityById(command.activityId)
    if (!activity || activity.projectId !== command.projectId) {
      throw new NotFoundError("Atividade não encontrada")
    }

    const errors = validateProjectAttachmentMetadata({ name: command.name, size: command.size })
    if (errors.length > 0) {
      throw new ValidationError(projectValidationMessage(errors))
    }

    return await this.dependencies.files.create({
      activityId: activity.id,
      blobKey: command.blobKey,
      name: String(command.name).trim(),
      contentType: command.contentType,
      size: Number(command.size),
      uploadedBy: command.actorId,
    })
  }
}
