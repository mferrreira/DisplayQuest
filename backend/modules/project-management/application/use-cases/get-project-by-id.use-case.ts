import type { ProjectManagementGateway } from "@/backend/modules/project-management/application/ports/project-management.gateway"

export class GetProjectByIdUseCase {
  constructor(private readonly gateway: ProjectManagementGateway) {}

  async execute(projectId: number) {
    return await this.gateway.getProjectById(projectId)
  }
}
