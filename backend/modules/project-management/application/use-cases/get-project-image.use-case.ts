import { ForbiddenError, NotFoundError } from "@/backend/domain"
import type { GetProjectImageQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { resolveCanActorAccessProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"

/**
 * GetProjectImageUseCase — V5-2d (DEC-101/102). Existe para a rota que serve o binário: a leitura
 * de uma imagem do projeto decide acesso igual à leitura do projeto, e slot sem imagem responde
 * 404 em vez de servir um objeto vazio.
 */
export interface GetProjectImageDependencies {
  projects: ProjectRepositoryPort
  actors: ProjectActorsPort
}

export class GetProjectImageUseCase {
  constructor(private readonly dependencies: GetProjectImageDependencies) {}

  async execute(query: GetProjectImageQuery) {
    const project = await this.dependencies.projects.findById(query.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    const canAccess = await resolveCanActorAccessProject(
      { actors: this.dependencies.actors },
      query.projectId,
      query.actorId,
      query.actorRoles,
    )
    if (!canAccess) {
      throw new ForbiddenError("Usuário não tem acesso a este projeto")
    }

    const field = query.slot === "logo" ? "logoKey" : "bannerKey"
    const blobKey = (project[field] as string | null | undefined) ?? null
    if (!blobKey) {
      throw new NotFoundError("Imagem não encontrada")
    }

    return { slot: query.slot, blobKey }
  }
}
