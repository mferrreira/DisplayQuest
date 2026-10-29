import {
  ACTIVITY_RESPONSIBLE_MESSAGE,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  activityPeriod,
  normalizeActivityDescription,
  normalizeActivityMonth,
  normalizeActivityResponsibleId,
} from "@/backend/domain"
import type { UpdateProjectActivityCommand } from "@/backend/modules/project-management/application/contracts"
import type {
  ProjectActivityRecord,
  ProjectActivityUpdateFields,
  ProjectCronogramaPort,
} from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * UpdateProjectActivityUseCase — V5-5. Corpo parcial: chave ausente não apaga (DEC-149, medido
 * no vínculo). Os meses são mesclados com os gravados, e é por isso que a tela pode estender o
 * fim de uma linha mandando só `lastMonth`.
 *
 * `status` não entra aqui de propósito: abrir, solicitar conclusão e concluir são o fluxo de duas
 * fases do V5-7 (DEC-76), com gate e prêmio próprios. Um PATCH que escrevesse `DONE` criaria um
 * segundo caminho para o fim da atividade sem prêmio e sem notificação.
 */
export interface UpdateProjectActivityDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class UpdateProjectActivityUseCase {
  constructor(private readonly dependencies: UpdateProjectActivityDependencies) {}

  async execute(command: UpdateProjectActivityCommand): Promise<ProjectActivityRecord> {
    const project = await this.dependencies.projects.findById(command.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    const activity = await this.dependencies.cronograma.findActivityById(command.activityId)
    if (!activity || activity.projectId !== command.projectId) {
      throw new NotFoundError("Atividade não encontrada no projeto")
    }

    const canManage = await resolveCanActorManageProject(
      { memberships: this.dependencies.memberships, actors: this.dependencies.actors },
      command.projectId,
      command.actorId,
    )
    if (!canManage) {
      throw new ForbiddenError("Usuário não tem permissão para gerenciar este projeto")
    }

    const fields: ProjectActivityUpdateFields = {}

    if (command.description !== undefined) {
      fields.description = normalizeActivityDescription(command.description)
    }

    if (command.firstMonth !== undefined || command.lastMonth !== undefined) {
      const firstMonth = normalizeActivityMonth(command.firstMonth ?? activity.firstMonth)
      const lastMonth = normalizeActivityMonth(command.lastMonth ?? activity.lastMonth)
      activityPeriod(firstMonth, lastMonth)
      fields.firstMonth = firstMonth
      fields.lastMonth = lastMonth
    }

    if (command.responsibleId !== undefined) {
      const responsibleId = normalizeActivityResponsibleId(command.responsibleId)
      if (responsibleId !== null) {
        const membership = await this.dependencies.memberships.findMembership(command.projectId, responsibleId)
        if (membership === null) {
          throw new ValidationError(ACTIVITY_RESPONSIBLE_MESSAGE)
        }
      }
      fields.responsibleId = responsibleId
    }

    if (Object.keys(fields).length === 0) {
      return activity
    }

    return await this.dependencies.cronograma.updateActivity(command.activityId, fields)
  }
}
