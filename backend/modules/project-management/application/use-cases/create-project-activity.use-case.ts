import {
  ACTIVITY_RESPONSIBLE_MESSAGE,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  activityPeriod,
  nextCronogramaOrder,
  normalizeActivityDescription,
  normalizeActivityMonth,
  normalizeActivityResponsibleId,
} from "@/backend/domain"
import type { CreateProjectActivityCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * CreateProjectActivityUseCase — V5-5 (DEC-126). Uma linha da grade: descrição + intervalo de
 * meses. O que a linha vale (100 × meses) e o período que ela cobre são derivados na regra; aqui
 * só entra o que a pessoa marcou.
 *
 * O responsável é opcional, e quando existe precisa participar do projeto: a tela lista os
 * membros do projeto, e aceitar um id de fora criaria uma atividade atribuída a alguém que não
 * tem nada a ver com ela — e o 403/404 do resto do sistema passaria a discordar da tela.
 */
export interface CreateProjectActivityDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class CreateProjectActivityUseCase {
  constructor(private readonly dependencies: CreateProjectActivityDependencies) {}

  async execute(command: CreateProjectActivityCommand) {
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

    const description = normalizeActivityDescription(command.description)
    const firstMonth = normalizeActivityMonth(command.firstMonth)
    const lastMonth = normalizeActivityMonth(command.lastMonth)
    // Valida o intervalo antes de escrever: `lastMonth` antes de `firstMonth` é recusa nomeada,
    // não intervalo invertido silencioso (DEC-132, a mesma lição do período do projeto).
    activityPeriod(firstMonth, lastMonth)

    const responsibleId = normalizeActivityResponsibleId(command.responsibleId)
    if (responsibleId !== null) {
      const membership = await this.dependencies.memberships.findMembership(command.projectId, responsibleId)
      if (membership === null) {
        throw new ValidationError(ACTIVITY_RESPONSIBLE_MESSAGE)
      }
    }

    const existing = await this.dependencies.cronograma.listActivities(command.projectId)

    return await this.dependencies.cronograma.createActivity({
      projectId: command.projectId,
      order: nextCronogramaOrder(existing.map((activity) => activity.order)),
      description,
      responsibleId,
      firstMonth,
      lastMonth,
    })
  }
}
