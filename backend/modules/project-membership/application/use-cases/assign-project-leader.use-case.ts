import type { AssignProjectLeaderCommand } from "@/backend/modules/project-membership/application/contracts"
import type { ProjectMembershipGateway } from "@/backend/modules/project-membership/application/ports/project-membership.gateway"

export class AssignProjectLeaderUseCase {
  constructor(private readonly gateway: ProjectMembershipGateway) {}

  async execute(command: AssignProjectLeaderCommand) {
    return await this.gateway.assignProjectLeader(command)
  }
}
