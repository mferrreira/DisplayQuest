import type { RemoveProjectMemberCommand } from "@/backend/modules/project-membership/application/contracts"
import type { ProjectMembershipGateway } from "@/backend/modules/project-membership/application/ports/project-membership.gateway"

export class RemoveProjectMemberUseCase {
  constructor(private readonly gateway: ProjectMembershipGateway) {}

  async execute(command: RemoveProjectMemberCommand) {
    return await this.gateway.removeProjectMember(command)
  }
}
