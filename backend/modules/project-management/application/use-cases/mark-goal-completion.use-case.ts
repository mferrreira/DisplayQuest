import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/backend/domain"
import type { MarkGoalCompletionCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * MarkGoalCompletionUseCase — S05 (plan-v21, DEC-260).
 *
 * Ordem medida: projeto 404 -> gate de gestão 403 -> meta 404 (id de outro projeto NÃO é
 * "achei e marquei") -> corpo. Marcar grava `completedAt` = o `now` do comando (nunca
 * `new Date()` solto, DEC-132) e `completedBy` = ator. Desmarcar zera os dois — o cumprimento
 * é estado da linha, não log.
 */
export const GOAL_COMPLETED_BODY_MESSAGE = "completed deve ser true ou false"

export interface MarkGoalCompletionDependencies {
  projects: ProjectRepositoryPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
  cronograma: ProjectCronogramaPort
}

export class MarkGoalCompletionUseCase {
  constructor(private readonly dependencies: MarkGoalCompletionDependencies) {}

  async execute(command: MarkGoalCompletionCommand) {
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

    const goal = await this.dependencies.cronograma.findGoalById(command.goalId)
    if (!goal || goal.projectId !== command.projectId) {
      throw new NotFoundError("Meta não encontrada")
    }

    if (typeof command.completed !== "boolean") {
      throw new ValidationError(GOAL_COMPLETED_BODY_MESSAGE)
    }

    return await this.dependencies.cronograma.updateGoal(goal.id, command.completed
      ? { completedAt: command.now.toISOString(), completedBy: command.actorId }
      : { completedAt: null, completedBy: null })
  }
}
