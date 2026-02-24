import type {
  AddProjectMemberCommand,
  AssignProjectLeaderCommand,
  ListProjectMembersQuery,
  RemoveProjectMemberCommand,
  UpsertProjectMemberRolesCommand,
} from "@/backend/modules/project-membership/application/contracts"
import { AddProjectMemberUseCase } from "@/backend/modules/project-membership/application/use-cases/add-project-member.use-case"
import { AssignProjectLeaderUseCase } from "@/backend/modules/project-membership/application/use-cases/assign-project-leader.use-case"
import { ListProjectMembersUseCase } from "@/backend/modules/project-membership/application/use-cases/list-project-members.use-case"
import { RemoveProjectMemberUseCase } from "@/backend/modules/project-membership/application/use-cases/remove-project-member.use-case"
import { UpsertProjectMemberRolesUseCase } from "@/backend/modules/project-membership/application/use-cases/upsert-project-member-roles.use-case"
import {
  createProjectMembershipGateway,
  PrismaProjectMembershipGateway,
} from "@/backend/modules/project-membership/infrastructure/prisma-project-membership.gateway"

export class ProjectMembershipModule {
  constructor(
    private readonly listProjectMembersUseCase: ListProjectMembersUseCase,
    private readonly addProjectMemberUseCase: AddProjectMemberUseCase,
    private readonly removeProjectMemberUseCase: RemoveProjectMemberUseCase,
    private readonly upsertProjectMemberRolesUseCase: UpsertProjectMemberRolesUseCase,
    private readonly assignProjectLeaderUseCase: AssignProjectLeaderUseCase,
    private readonly _gateway: PrismaProjectMembershipGateway,
  ) {}

  async listProjectMembers(query: ListProjectMembersQuery) {
    return await this.listProjectMembersUseCase.execute(query)
  }

  async addProjectMember(command: AddProjectMemberCommand) {
    return await this.addProjectMemberUseCase.execute(command)
  }

  async removeProjectMember(command: RemoveProjectMemberCommand) {
    return await this.removeProjectMemberUseCase.execute(command)
  }

  async upsertProjectMemberRoles(command: UpsertProjectMemberRolesCommand) {
    return await this.upsertProjectMemberRolesUseCase.execute(command)
  }

  async assignProjectLeader(command: AssignProjectLeaderCommand) {
    return await this.assignProjectLeaderUseCase.execute(command)
  }
}

export interface ProjectMembershipModuleFactoryOptions {
  gateway?: PrismaProjectMembershipGateway
}

export function createProjectMembershipModule(options: ProjectMembershipModuleFactoryOptions = {}) {
  const gateway = options.gateway ?? createProjectMembershipGateway()

  return new ProjectMembershipModule(
    new ListProjectMembersUseCase(gateway),
    new AddProjectMemberUseCase(gateway),
    new RemoveProjectMemberUseCase(gateway),
    new UpsertProjectMemberRolesUseCase(gateway),
    new AssignProjectLeaderUseCase(gateway),
    gateway,
  )
}
