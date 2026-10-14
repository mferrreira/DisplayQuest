import {
  ForbiddenError,
  NotFoundError,
  nextCronogramaOrder,
  normalizeGoalDescription,
  normalizeGoalTarget,
} from "@/backend/domain"
import type { CreateProjectGoalCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * CreateProjectGoalUseCase — V5-5 (DEC-156). Meta do projeto: texto obrigatório, número opcional.
 *
 * A ordem é atribuída pelo servidor (`nextCronogramaOrder`), nunca recebida da tela: é o que
 * impede duas linhas "Etapa 3" no mesmo projeto, e é o motivo pelo qual o formulário do wizard
 * manda uma lista ordenada e não um número por linha.
 *
 * Gate de gestão antes de validar o corpo: quem não gerencia recebe 403, não 400 (o par medido
 * do B6-2b, preservado em todas as rotas de projeto do V5-2c).
 */
export interface CreateProjectGoalDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class CreateProjectGoalUseCase {
  constructor(private readonly dependencies: CreateProjectGoalDependencies) {}

  async execute(command: CreateProjectGoalCommand) {
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

    const description = normalizeGoalDescription(command.description)
    const target = normalizeGoalTarget(command.target)
    const existing = await this.dependencies.cronograma.listGoals(command.projectId)

    return await this.dependencies.cronograma.createGoal({
      projectId: command.projectId,
      order: nextCronogramaOrder(existing.map((goal) => goal.order)),
      target,
      description,
    })
  }
}
