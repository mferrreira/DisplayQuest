import { ForbiddenError, NotFoundError, normalizeGoalDescription, normalizeGoalTarget } from "@/backend/domain"
import type { UpdateProjectGoalCommand } from "@/backend/modules/project-management/application/contracts"
import type {
  ProjectCronogramaPort,
  ProjectGoalRecord,
  ProjectGoalUpdateFields,
} from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * UpdateProjectGoalUseCase — V5-5. Corpo parcial, mesma regra medida do vínculo no V5-4b:
 * chave ausente no corpo não apaga o que está gravado. `target: null` é apagar o número;
 * `target` ausente é deixar como está — os dois são diferentes e é o corpo que diz qual.
 *
 * A garantia de "nada é gravado a meias" é daqui, não da função de normalização: cada campo é
 * normalizado sobre uma cópia e o `update` só roda depois de todos passarem (gotcha medido no
 * V5-4b).
 */
export interface UpdateProjectGoalDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class UpdateProjectGoalUseCase {
  constructor(private readonly dependencies: UpdateProjectGoalDependencies) {}

  async execute(command: UpdateProjectGoalCommand): Promise<ProjectGoalRecord> {
    const project = await this.dependencies.projects.findById(command.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    const goal = await this.dependencies.cronograma.findGoalById(command.goalId)
    if (!goal || goal.projectId !== command.projectId) {
      throw new NotFoundError("Meta não encontrada no projeto")
    }

    const canManage = await resolveCanActorManageProject(
      { memberships: this.dependencies.memberships, actors: this.dependencies.actors },
      command.projectId,
      command.actorId,
    )
    if (!canManage) {
      throw new ForbiddenError("Usuário não tem permissão para gerenciar este projeto")
    }

    const fields: ProjectGoalUpdateFields = {}
    if (command.description !== undefined) {
      fields.description = normalizeGoalDescription(command.description)
    }
    if (command.target !== undefined) {
      fields.target = normalizeGoalTarget(command.target)
    }

    if (Object.keys(fields).length === 0) {
      return goal
    }

    return await this.dependencies.cronograma.updateGoal(command.goalId, fields)
  }
}
