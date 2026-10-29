import { ForbiddenError, canActorAccessProjectDecision } from "@/backend/domain"
import type { ListProjectsForActorQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import type { ProjectCompletionRequestsPort } from "@/backend/modules/project-management/application/ports/project-completion-requests.port"

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
  /** Fix 4: ids de projeto com atividade em COMPLETION_REQUESTED (projeção do flag). */
  completionRequests: ProjectCompletionRequestsPort
}

export class ListProjectsForActorUseCase {
  constructor(private readonly dependencies: ListProjectsForActorDependencies) {}

  async execute(query: ListProjectsForActorQuery) {
    if (!canActorAccessProjectDecision(query.actorId)) {
      throw new ForbiddenError("Acesso negado ao projeto")
    }

    const [projects, requestedProjectIds] = await Promise.all([
      this.dependencies.projects.findAll(),
      this.dependencies.completionRequests.listProjectIdsWithRequests(),
    ])
    const requestedIds = new Set(requestedProjectIds)
    return projects.map((project) => ({
      ...project,
      isMember: project.members?.some((member) => member.userId === query.actorId) ?? false,
      // Fix 4: flag "tem conclusão solicitada" — a tela de gestão pinta o cartão avermelhado por
      // ele. Projeção, não coluna: vem de `project_activities` na mesma leitura da lista.
      completionRequested: project.id != null && requestedIds.has(project.id),
    }))
  }
}
