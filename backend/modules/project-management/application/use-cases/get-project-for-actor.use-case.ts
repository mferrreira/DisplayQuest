import { ForbiddenError, NotFoundError, canActorAccessProjectDecision } from "@/backend/domain"
import type { GetProjectForActorQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * GetProjectForActorUseCase — OND5-B2 (R2), com a política de leitura reescrita no V5-2a
 * (DEC-127): **qualquer autenticado lê o detalhe do projeto.**
 *
 * Os dois erros continuam congelados verbatim ("Projeto não encontrado" 404, "Acesso negado ao
 * projeto" 403). O que mudou é quando o 403 acontece: hoje ele só dispara quando não há ator
 * (id inválido), porque leitura deixou de depender de papel e de membership. A regra mora em
 * `domain/project/canActorAccessProjectDecision`, a mesma que a lista, os entregáveis, os anexos,
 * a imagem, as horas e os membros consultam.
 *
 * O `actors` saiu das dependências: a leitura não consulta mais membership nem líder/criador.
 */
export interface GetProjectForActorDependencies {
  projects: ProjectRepositoryPort
}

export class GetProjectForActorUseCase {
  constructor(private readonly dependencies: GetProjectForActorDependencies) {}

  async execute(query: GetProjectForActorQuery) {
    const project = await this.dependencies.projects.findById(query.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    if (!canActorAccessProjectDecision(query.actorId)) {
      throw new ForbiddenError("Acesso negado ao projeto")
    }

    return project
  }
}
