import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  deliverableValidationMessage,
  normalizeDeliverableInput,
  validateDeliverableInput,
} from "@/backend/domain"
import type { UpdateProjectDeliverableCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectDeliverablesPort } from "@/backend/modules/project-management/application/ports/project-deliverables.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * UpdateProjectDeliverableUseCase — V5-2c.
 *
 * Corpo parcial é aceito: chave ausente mantém o valor gravado (mesma postura de
 * `applyProjectUpdate`). E o entregável é procurado **dentro do projeto** — um id que existe
 * mas pertence a outro projeto responde 404, não "achei e editei".
 */
export interface UpdateProjectDeliverableDependencies {
  projects: ProjectRepositoryPort
  deliverables: ProjectDeliverablesPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class UpdateProjectDeliverableUseCase {
  constructor(private readonly dependencies: UpdateProjectDeliverableDependencies) {}

  async execute(command: UpdateProjectDeliverableCommand) {
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

    const fields = normalizeDeliverableInput({
      name: command.name !== undefined ? command.name : deliverable.name,
      quantity: command.quantity !== undefined ? command.quantity : deliverable.quantity,
    })
    const errors = validateDeliverableInput(fields)
    if (errors.length > 0) {
      throw new ValidationError(deliverableValidationMessage(errors))
    }

    return await this.dependencies.deliverables.update(deliverable.id, fields)
  }
}
