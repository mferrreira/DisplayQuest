import type { ListProjectMembersQuery } from "@/backend/modules/project-membership/application/contracts"
import type { ProjectMembershipGateway } from "@/backend/modules/project-membership/application/ports/project-membership.gateway"

export class ListProjectMembersUseCase {
  constructor(private readonly gateway: ProjectMembershipGateway) {}

  async execute(query: ListProjectMembersQuery) {
    return await this.gateway.listProjectMembers(query)
  }
}
