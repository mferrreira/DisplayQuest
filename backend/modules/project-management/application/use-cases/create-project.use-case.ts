import type { CreateProjectCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectManagementGateway } from "@/backend/modules/project-management/application/ports/project-management.gateway"

export class CreateProjectUseCase {
  constructor(private readonly gateway: ProjectManagementGateway) {}

  async execute(command: CreateProjectCommand) {
    return await this.gateway.createProject(command)
  }
}
