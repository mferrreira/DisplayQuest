import type { GetProjectVolunteersQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectManagementGateway } from "@/backend/modules/project-management/application/ports/project-management.gateway"
import { hasPermission } from "@/lib/auth/rbac"

export class GetProjectVolunteersUseCase {
  constructor(private readonly gateway: ProjectManagementGateway) {}

  async execute(query: GetProjectVolunteersQuery) {
    const canViewAll = hasPermission(query.actorRoles, "MANAGE_PROJECTS")
    const canManageProject = await this.gateway.canActorManageProject(query.projectId, query.actorId)

    if (!canViewAll && !canManageProject) {
      throw new Error("Acesso negado ao projeto")
    }

    return await this.gateway.getProjectVolunteersStats(query.projectId)
  }
}
