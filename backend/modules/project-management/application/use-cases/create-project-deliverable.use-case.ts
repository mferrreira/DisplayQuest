import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  deliverableValidationMessage,
  normalizeDeliverableInput,
  validateDeliverableInput,
} from "@/backend/domain"
import type { CreateProjectDeliverableCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectDeliverablesPort } from "@/backend/modules/project-management/application/ports/project-deliverables.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * CreateProjectDeliverableUseCase — V5-2c. Projeto inexistente -> 404; sem gestão -> 403;
 * nome/quantidade inválidos -> 400 com `Dados inválidos: ...`, a mesma forma da validação de
 * projeto (DEC-132). A regra é `project-files-rules.ts`, não daqui.
 */
export interface CreateProjectDeliverableDependencies {
  projects: ProjectRepositoryPort
  deliverables: ProjectDeliverablesPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class CreateProjectDeliverableUseCase {
  constructor(private readonly dependencies: CreateProjectDeliverableDependencies) {}

  async execute(command: CreateProjectDeliverableCommand) {
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

    const fields = normalizeDeliverableInput({ name: command.name, quantity: command.quantity })
    const errors = validateDeliverableInput(fields)
    if (errors.length > 0) {
      throw new ValidationError(deliverableValidationMessage(errors))
    }

    return await this.dependencies.deliverables.create({
      projectId: command.projectId,
      name: fields.name,
      quantity: fields.quantity,
    })
  }
}
