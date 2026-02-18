import type { ListProjectsForActorQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectManagementGateway } from "@/backend/modules/project-management/application/ports/project-management.gateway"
import { hasPermission } from "@/lib/auth/rbac"

export class ListProjectsForActorUseCase {
  constructor(private readonly gateway: ProjectManagementGateway) {}

  async execute(query: ListProjectsForActorQuery) {
    if (hasPermission(query.actorRoles, "MANAGE_TASKS")) {
      return await this.gateway.listAllProjects()
    }

    const userProjects = await this.gateway.listProjectsByUser(query.actorId)
    const createdProjects = await this.gateway.listProjectsByCreator(query.actorId)
    const allProjects = [...userProjects, ...createdProjects]

    return allProjects.filter(
      (project, index, self) => index === self.findIndex((candidate) => candidate.id === project.id),
    )
  }
}
