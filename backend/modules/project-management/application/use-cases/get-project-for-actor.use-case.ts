import { ForbiddenError, NotFoundError, hasPermission } from "@/backend/domain"
import type { GetProjectForActorQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { canActorAccessProjectDecision } from "@/backend/domain"

/**
 * GetProjectForActorUseCase — OND5-B2 (R2). Frozen from the legacy use case + gateway
 * (:41-63): not-found -> "Projeto não encontrado"; MANAGE_PROJECTS role bypass; otherwise
 * the access decision -> "Acesso negado ao projeto". Errors are typed now (AC-00-07);
 * the messages are the legacy ones verbatim.
 */
export interface GetProjectForActorDependencies {
  projects: ProjectRepositoryPort
  actors: ProjectActorsPort
}

export class GetProjectForActorUseCase {
  constructor(private readonly dependencies: GetProjectForActorDependencies) {}

  async execute(query: GetProjectForActorQuery) {
    const project = await this.dependencies.projects.findById(query.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    if (hasPermission(query.actorRoles, "MANAGE_PROJECTS")) {
      return project
    }

    const membershipExists = await this.dependencies.actors.membershipExists(query.projectId, query.actorId)
    const relation = await this.dependencies.actors.findProjectRelation(query.projectId)
    const canAccess = canActorAccessProjectDecision(query.actorRoles, query.actorId, membershipExists, relation)
    if (!canAccess) {
      throw new ForbiddenError("Acesso negado ao projeto")
    }

    return project
  }
}
