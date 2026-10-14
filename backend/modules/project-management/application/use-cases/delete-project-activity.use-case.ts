import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { DeleteProjectActivityCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorManageProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * DeleteProjectActivityUseCase — V5-5.
 *
 * Apagar a linha do cronograma não apaga as tasks: a ligação `tasks.activityId` chega no V5-6, e
 * quando ela existir a linha apagada deixa de existir sem arrastar trabalho registrado — as tasks
 * continuam no projeto, só passam a não ter atividade. É o reverso do que a trava do DEC-99 faz
 * com o caminho contrário (solicitar conclusão com task pendente é recusado).
 */
export interface DeleteProjectActivityDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
}

export class DeleteProjectActivityUseCase {
  constructor(private readonly dependencies: DeleteProjectActivityDependencies) {}

  async execute(command: DeleteProjectActivityCommand) {
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

    await this.dependencies.cronograma.deleteActivity(command.activityId)
    return { deleted: true, activityId: command.activityId }
  }
}
