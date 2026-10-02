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
import type { ProjectAccessPort } from "@/backend/modules/project-membership/application/ports/project-access.port"
import type { ProjectHoursPort } from "@/backend/modules/project-membership/application/ports/project-hours.port"
import type { ProjectMembershipRepositoryPort } from "@/backend/modules/project-membership/application/ports/project-membership.repository"
import { createPrismaMembershipRepository } from "@/backend/modules/project-membership/infrastructure/repositories/prisma-membership.repository"
import { createPrismaProjectAccessPort } from "@/backend/modules/project-membership/infrastructure/repositories/prisma-project-access.port"
import { createPrismaProjectHoursPort } from "@/backend/modules/project-membership/infrastructure/repositories/prisma-project-hours.port"

/**
 * ProjectMembershipModule — OND5-B2 (R1/R2). The use cases now HOLD the rules (frozen by
 * the golden matrix OND5-B1) over thin ports; the module surface for the routes is
 * UNCHANGED. The legacy `PrismaProjectMembershipGateway` was removed in OND9-B1
 * (repo-cleanup B8, 2026-10-01) together with the contract suite — old behavior preserved
 * in git (tag `pre-cleanup`).
 */
export class ProjectMembershipModule {
  constructor(
    private readonly listProjectMembersUseCase: ListProjectMembersUseCase,
    private readonly addProjectMemberUseCase: AddProjectMemberUseCase,
    private readonly removeProjectMemberUseCase: RemoveProjectMemberUseCase,
    private readonly upsertProjectMemberRolesUseCase: UpsertProjectMemberRolesUseCase,
    private readonly assignProjectLeaderUseCase: AssignProjectLeaderUseCase,
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

export interface ProjectMembershipModulePorts {
  memberships: ProjectMembershipRepositoryPort
  access: ProjectAccessPort
  hours: ProjectHoursPort
}

export interface ProjectMembershipModuleFactoryOptions {
  ports?: Partial<ProjectMembershipModulePorts>
}

export function createProjectMembershipModule(options: ProjectMembershipModuleFactoryOptions = {}) {
  const ports: ProjectMembershipModulePorts = {
    memberships: options.ports?.memberships ?? createPrismaMembershipRepository(),
    access: options.ports?.access ?? createPrismaProjectAccessPort(),
    hours: options.ports?.hours ?? createPrismaProjectHoursPort(),
  }

  return new ProjectMembershipModule(
    new ListProjectMembersUseCase({ memberships: ports.memberships, hours: ports.hours }),
    new AddProjectMemberUseCase({ memberships: ports.memberships, access: ports.access }),
    new RemoveProjectMemberUseCase({ memberships: ports.memberships }),
    new UpsertProjectMemberRolesUseCase({ memberships: ports.memberships, access: ports.access }),
    new AssignProjectLeaderUseCase({ memberships: ports.memberships, access: ports.access }),
  )
}
