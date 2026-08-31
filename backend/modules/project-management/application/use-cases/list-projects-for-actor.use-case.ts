import type { ListProjectsForActorQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectManagementGateway } from "@/backend/modules/project-management/application/ports/project-management.gateway"
import { hasPermission } from "@/lib/auth/rbac"

export class ListProjectsForActorUseCase {
  constructor(private readonly gateway: ProjectManagementGateway) {}

  async execute(query: ListProjectsForActorQuery) {
    // POLÍTICA: "laboratório aberto". Quem tem MANAGE_TASKS (COORDENADOR, GERENTE,
    // GERENTE_PROJETO, COLABORADOR, PESQUISADOR) precisa criar/editar tarefas de
    // qualquer projeto, então enxerga TODOS os projetos. NÃO MUDAR sem revisão —
    // comportamento travado por teste de contrato (A9, spec .spec/tasks.md Tarefa 3).
    if (hasPermission(query.actorRoles, "MANAGE_TASKS")) {
      return await this.gateway.listAllProjects()
    }

    const userProjects = await this.gateway.listProjectsByUser(query.actorId)
    const createdProjects = await this.gateway.listProjectsByCreator(query.actorId)
    const ledProjects = await this.gateway.listProjectsByLeaderId(query.actorId)
    const allProjects = [...userProjects, ...createdProjects, ...ledProjects]

    return allProjects.filter(
      (project, index, self) => index === self.findIndex((candidate) => candidate.id === project.id),
    )
  }
}
