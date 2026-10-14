import { ForbiddenError, NotFoundError, canActorAccessProjectDecision } from "@/backend/domain"
import type { GetActivityFileQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActivityFilesPort } from "@/backend/modules/project-management/application/ports/project-activity-files.repository"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * GetActivityFileUseCase — V5-7a. O metadado do arquivo que a rota de binário vai servir:
 * a rota checa aqui que a prova existe e pertence àquela atividade daquele projeto, e só então
 * lê o objeto no bucket pela chave do registro (mesma ordem medida do anexo, DEC-133).
 */
export interface GetActivityFileDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
  files: ProjectActivityFilesPort
}

export class GetActivityFileUseCase {
  constructor(private readonly dependencies: GetActivityFileDependencies) {}

  async execute(query: GetActivityFileQuery) {
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

    const file = await this.dependencies.files.findById(query.fileId)
    if (!file || file.activityId !== activity.id) {
      throw new NotFoundError("Prova não encontrada")
    }

    return file
  }
}
