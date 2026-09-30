import { dedupeProjectsById, hasPermission } from "@/backend/domain"
import type { ListProjectsForActorQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * ListProjectsForActorUseCase — OND5-B2 (R2).
 *
 * POLÍTICA: "laboratório aberto". Quem tem MANAGE_TASKS (COORDENADOR, GERENTE,
 * GERENTE_PROJETO, COLABORADOR, PESQUISADOR) precisa criar/editar tarefas de
 * qualquer projeto, então enxerga TODOS os projetos. NÃO MUDAR sem revisão —
 * comportamento travado por teste de contrato (A9, spec .spec/tasks.md Tarefa 3).
 */
export interface ListProjectsForActorDependencies {
  projects: ProjectRepositoryPort
}

export class ListProjectsForActorUseCase {
  constructor(private readonly dependencies: ListProjectsForActorDependencies) {}

  async execute(query: ListProjectsForActorQuery) {
    if (hasPermission(query.actorRoles, "MANAGE_TASKS")) {
      return await this.dependencies.projects.findAll()
    }

    const userProjects = await this.dependencies.projects.findByUserId(query.actorId)
    const createdProjects = await this.dependencies.projects.findByCreatorId(query.actorId)
    const ledProjects = await this.dependencies.projects.findByLeaderId(query.actorId)

    return dedupeProjectsById([...userProjects, ...createdProjects, ...ledProjects])
  }
}
