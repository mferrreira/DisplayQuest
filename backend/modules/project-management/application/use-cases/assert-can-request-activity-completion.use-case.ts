import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { AssertCanRequestActivityCompletionCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanRequestActivityCompletion } from "@/backend/modules/project-management/application/use-cases/internal/activity-completion-access"

/**
 * AssertCanRequestActivityCompletionUseCase — V5-7a (DEC-54/133). A checagem que a rota de
 * upload executa ANTES de ler o corpo multipart: sem ela, quem não pode pedir empurraria
 * bytes ao bucket e só depois receberia o 403 — o custo medido no anexo (DEC-133) vale igual
 * para a prova. A atividade é checada aqui pelo mesmo motivo: sem linha não há o que provar,
 * e escrever objeto para atividade inexistente deixaria um órfão que nenhuma tela alcança.
 *
 * O use case de anexar rechecha o gate de propósito (DEC-54): a assertiva protege a rota, o
 * rechecho protege qualquer outro chamador.
 */
export interface AssertCanRequestActivityCompletionDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  memberships: ProjectManagementMembershipPort
}

export class AssertCanRequestActivityCompletionUseCase {
  constructor(private readonly dependencies: AssertCanRequestActivityCompletionDependencies) {}

  async execute(command: AssertCanRequestActivityCompletionCommand) {
    const { project, canRequest } = await resolveCanRequestActivityCompletion(
      { projects: this.dependencies.projects, memberships: this.dependencies.memberships },
      command.projectId,
      command.actorId,
    )
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    const activity = await this.dependencies.cronograma.findActivityById(command.activityId)
    if (!activity || activity.projectId !== command.projectId) {
      throw new NotFoundError("Atividade não encontrada")
    }

    if (!canRequest) {
      throw new ForbiddenError("Usuário não tem permissão para solicitar a conclusão desta atividade")
    }
  }
}
