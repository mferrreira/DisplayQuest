import { ForbiddenError, NotFoundError, canActorAccessProjectDecision } from "@/backend/domain"
import type { ListActivityFilesQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActivityFilesPort } from "@/backend/modules/project-management/application/ports/project-activity-files.repository"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * ListActivityFilesUseCase — V5-7a (DEC-127/157). A leitura da prova herda a leitura aberta do
 * projeto: quem vê o cronograma vê as provas da linha. Nenhum byte de bucket é tocado aqui,
 * então a listagem roda sem bucket no ar (mesma postura do anexo, DEC-133).
 */
export interface ListActivityFilesDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  files: ProjectActivityFilesPort
}

export class ListActivityFilesUseCase {
  constructor(private readonly dependencies: ListActivityFilesDependencies) {}

  async execute(query: ListActivityFilesQuery) {
    const project = await this.dependencies.projects.findById(query.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    if (!canActorAccessProjectDecision(query.actorId)) {
      throw new ForbiddenError("Usuário não tem acesso a este projeto")
    }

    const activity = await this.dependencies.cronograma.findActivityById(query.activityId)
    if (!activity || activity.projectId !== query.projectId) {
      throw new NotFoundError("Atividade não encontrada")
    }

    return await this.dependencies.files.listByActivity(activity.id)
  }
}
