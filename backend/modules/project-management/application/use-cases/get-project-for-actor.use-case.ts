import type { GetProjectForActorQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectManagementGateway } from "@/backend/modules/project-management/application/ports/project-management.gateway"
import { hasPermission } from "@/lib/auth/rbac"

export class GetProjectForActorUseCase {
  constructor(private readonly gateway: ProjectManagementGateway) {}

  async execute(query: GetProjectForActorQuery) {
    const project = await this.gateway.getProjectById(query.projectId)
    if (!project) {
      throw new Error("Projeto não encontrado")
    }

    if (hasPermission(query.actorRoles, "MANAGE_PROJECTS")) {
      return project
    }

    const canAccess = await this.gateway.canActorAccessProject(query.projectId, query.actorId, query.actorRoles)
    if (!canAccess) {
      throw new Error("Acesso negado ao projeto")
    }

    return project
  }
}
