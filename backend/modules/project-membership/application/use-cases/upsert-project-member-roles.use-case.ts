import type { UpsertProjectMemberRolesCommand } from "@/backend/modules/project-membership/application/contracts"
import type { ProjectMembershipGateway } from "@/backend/modules/project-membership/application/ports/project-membership.gateway"

export class UpsertProjectMemberRolesUseCase {
  constructor(private readonly gateway: ProjectMembershipGateway) {}

  async execute(command: UpsertProjectMemberRolesCommand) {
    return await this.gateway.upsertProjectMemberRoles(command)
  }
}
