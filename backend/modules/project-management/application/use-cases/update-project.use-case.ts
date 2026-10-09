import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  applyProjectUpdate,
  hasLeaderConflict,
  projectValidationMessage,
  validateProjectInput,
} from "@/backend/domain"
import type { UpdateProjectCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * UpdateProjectUseCase — OND5-B2 (R2). Frozen from the legacy gateway (:106-138):
 * not-found -> manage gate -> leader-conflict check (OTHER projects only) -> field quirks
 * (applyProjectUpdate) -> repository-level validation ("Dados inválidos: ..." for an
 * invalid merged status, golden OND5-B1) -> full-record update.
 */
export interface UpdateProjectDependencies {
  projects: ProjectRepositoryPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class UpdateProjectUseCase {
  constructor(private readonly dependencies: UpdateProjectDependencies) {}

  async execute(command: UpdateProjectCommand) {
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

    const data = command.data as Record<string, unknown>

    if (data.leaderId !== undefined && data.leaderId !== null) {
      const existingLeaderProjects = await this.dependencies.projects.findByLeaderId(Number(data.leaderId))
      if (hasLeaderConflict(existingLeaderProjects, command.projectId)) {
        throw new ConflictError(
          "Este usuário já é líder de outro projeto. Um usuário só pode ser líder de um projeto por vez.",
        )
      }
    }

    const next = applyProjectUpdate(project, data)

    const errors = validateProjectInput(next)
    if (errors.length > 0) {
      throw new ValidationError(projectValidationMessage(errors))
    }

    return await this.dependencies.projects.update(next)
  }
}
