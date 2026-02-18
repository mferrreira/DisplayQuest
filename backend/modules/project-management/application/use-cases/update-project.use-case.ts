import type { UpdateProjectCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectManagementGateway } from "@/backend/modules/project-management/application/ports/project-management.gateway"

export class UpdateProjectUseCase {
  constructor(private readonly gateway: ProjectManagementGateway) {}

  async execute(command: UpdateProjectCommand) {
    return await this.gateway.updateProject(command)
  }
}
