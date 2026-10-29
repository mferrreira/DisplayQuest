import { ForbiddenError, canActorAccessProjectDecision } from "@/backend/domain"
import type { ListProjectsForActorQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * ListProjectsForActorUseCase — OND5-B2 (R2), com a política reescrita no V5-2a (DEC-127).
 *
 * A regra antiga ("laboratório aberto" por MANAGE_TASKS, e para o resto a união
 * membro ∪ criado ∪ liderado, dedup por id) morreu: ela deixava a lista e o detalhe com ACLs
 * diferentes, e o resultado medido era o COLABORADOR recebendo o projeto na lista e levando
 * "Acesso negado ao projeto" ao abrir. Hoje a lista é a mesma decisão do detalhe:
 * **qualquer autenticado vê todos os projetos** (`canActorAccessProjectDecision`).
 *
 * Escrita e gestão não mudam: continuam em `resolveCanActorManageProject` /
 * `canActorManageProjectDecision`.
 */
export interface ListProjectsForActorDependencies {
  projects: ProjectRepositoryPort
}

export class ListProjectsForActorUseCase {
  constructor(private readonly dependencies: ListProjectsForActorDependencies) {}

  async execute(query: ListProjectsForActorQuery) {
    if (!canActorAccessProjectDecision(query.actorId)) {
      throw new ForbiddenError("Acesso negado ao projeto")
    }

    const projects = await this.dependencies.projects.findAll()
    // R11 (S11): a lista marca, por projeto, se o ator é membro. É a fonte da primeira carga do
    // quadro (líder → seu projeto, senão primeiro vínculo, senão todos). Não é coluna: projeção.
    return projects.map((project) => ({
      ...project,
      isMember: project.members?.some((member) => member.userId === query.actorId) ?? false,
    }))
  }
}
