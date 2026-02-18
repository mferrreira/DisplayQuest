import type { DeleteProjectCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectManagementGateway } from "@/backend/modules/project-management/application/ports/project-management.gateway"

export class DeleteProjectUseCase {
  constructor(private readonly gateway: ProjectManagementGateway) {}

  async execute(command: DeleteProjectCommand) {
    await this.gateway.deleteProject(command)
  }
}
