import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { DeleteProjectGoalCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * DeleteProjectGoalUseCase — V5-5. A meta pertence ao projeto: uma meta de outro projeto não é
 * encontrada por id aqui (404), porque apagar pelo id de fora seria apagar o dado de outra
 * gestão. É o mesmo desenho do `deleteProjectDeliverable`.
 */
export interface DeleteProjectGoalDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class DeleteProjectGoalUseCase {
  constructor(private readonly dependencies: DeleteProjectGoalDependencies) {}

  async execute(command: DeleteProjectGoalCommand) {
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

    await this.dependencies.cronograma.deleteGoal(command.goalId)
    return { deleted: true, goalId: command.goalId }
  }
}
