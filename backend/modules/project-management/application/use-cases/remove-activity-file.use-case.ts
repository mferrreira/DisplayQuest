import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { RemoveActivityFileCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActivityFilesPort } from "@/backend/modules/project-management/application/ports/project-activity-files.repository"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanRequestActivityCompletion } from "@/backend/modules/project-management/application/use-cases/internal/activity-completion-access"

/**
 * RemoveActivityFileUseCase — V5-7a (DEC-162). Apagar prova obedece ao MESMO gate de pedir:
 * a prova é insumo da solicitação, e quem não pode pedir não pode desmontar o insumo dos
 * outros. Sem janela de status de propósito — depois de aprovada, a auditoria é o registro da
 * aprovação (`approvedBy`/`approvedAt` + histórico), não a pilha de arquivos; a ACL decide a
 * gestão dos arquivos em qualquer fase.
 */
export interface RemoveActivityFileDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  files: ProjectActivityFilesPort
  memberships: ProjectManagementMembershipPort
}

export class RemoveActivityFileUseCase {
  constructor(private readonly dependencies: RemoveActivityFileDependencies) {}

  async execute(command: RemoveActivityFileCommand) {
    const { project, canRequest } = await resolveCanRequestActivityCompletion(
      { projects: this.dependencies.projects, memberships: this.dependencies.memberships },
      command.projectId,
      command.actorId,
    )
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }
    if (!canRequest) {
      throw new ForbiddenError("Usuário não tem permissão para solicitar a conclusão desta atividade")
    }

    const activity = await this.dependencies.cronograma.findActivityById(command.activityId)
    if (!activity || activity.projectId !== command.projectId) {
      throw new NotFoundError("Atividade não encontrada")
    }

    const file = await this.dependencies.files.findById(command.fileId)
    if (!file || file.activityId !== activity.id) {
      throw new NotFoundError("Prova não encontrada")
    }

    await this.dependencies.files.delete(file.id)
    return file
  }
}
