import type { AddProjectMemberCommand } from "@/backend/modules/project-membership/application/contracts"
import type { ProjectMembershipGateway } from "@/backend/modules/project-membership/application/ports/project-membership.gateway"

export class AddProjectMemberUseCase {
  constructor(private readonly gateway: ProjectMembershipGateway) {}

  async execute(command: AddProjectMemberCommand) {
    return await this.gateway.addProjectMember(command)
  }
}
