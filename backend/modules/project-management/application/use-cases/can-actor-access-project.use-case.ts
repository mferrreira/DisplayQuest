import type { ProjectManagementGateway } from "@/backend/modules/project-management/application/ports/project-management.gateway"

export class CanActorAccessProjectUseCase {
  constructor(private readonly gateway: ProjectManagementGateway) {}

  async execute(projectId: number, actorId: number, actorRoles: unknown) {
    return await this.gateway.canActorAccessProject(projectId, actorId, actorRoles)
  }
}
