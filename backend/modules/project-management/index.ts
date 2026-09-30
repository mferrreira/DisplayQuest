import { ListProjectsForActorUseCase } from "@/backend/modules/project-management/application/use-cases/list-projects-for-actor.use-case"
import { GetProjectByIdUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-by-id.use-case"
import { GetProjectForActorUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-for-actor.use-case"
import { CanActorAccessProjectUseCase } from "@/backend/modules/project-management/application/use-cases/can-actor-access-project.use-case"
import { CanActorManageProjectUseCase } from "@/backend/modules/project-management/application/use-cases/can-actor-manage-project.use-case"
import { CreateProjectUseCase } from "@/backend/modules/project-management/application/use-cases/create-project.use-case"
import { UpdateProjectUseCase } from "@/backend/modules/project-management/application/use-cases/update-project.use-case"
import { DeleteProjectUseCase } from "@/backend/modules/project-management/application/use-cases/delete-project.use-case"
import { GetProjectVolunteersUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-volunteers.use-case"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectHoursPort } from "@/backend/modules/project-management/application/ports/project-hours.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { createPrismaProjectActorsPort } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project-actors.port"
import { createPrismaProjectHoursPort } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project-hours.port"
import { createPrismaProjectManagementMembershipRepository } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project-membership.repository"
import { createPrismaProjectRepository } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project.repository"

/**
 * ProjectManagementModule — OND5-B2 (R1/R2). The use cases now HOLD the rules (frozen by
 * the golden matrix OND5-B1) over thin ports; the module surface for the routes is
 * UNCHANGED. The legacy `ProjectServiceGateway` stays alive untouched as the "old
 * implementation indexed at the seam" for the contract suite (DEC-15); its removal is task
 * OND9-B1.
 */

type UseCaseExecute<T> = T extends { execute: (...args: infer A) => infer R } ? (...args: A) => R : never

export class ProjectManagementModule {
  readonly listProjectsForActor: UseCaseExecute<ListProjectsForActorUseCase>
  readonly getProjectById: UseCaseExecute<GetProjectByIdUseCase>
  readonly getProjectForActor: UseCaseExecute<GetProjectForActorUseCase>
  readonly canActorAccessProject: UseCaseExecute<CanActorAccessProjectUseCase>
  readonly canActorManageProject: UseCaseExecute<CanActorManageProjectUseCase>
  readonly createProject: UseCaseExecute<CreateProjectUseCase>
  readonly updateProject: UseCaseExecute<UpdateProjectUseCase>
  readonly deleteProject: UseCaseExecute<DeleteProjectUseCase>
  readonly getProjectVolunteers: UseCaseExecute<GetProjectVolunteersUseCase>

  constructor(
    private readonly listProjectsForActorUseCase: ListProjectsForActorUseCase,
    private readonly getProjectByIdUseCase: GetProjectByIdUseCase,
    private readonly getProjectForActorUseCase: GetProjectForActorUseCase,
    private readonly canActorAccessProjectUseCase: CanActorAccessProjectUseCase,
    private readonly canActorManageProjectUseCase: CanActorManageProjectUseCase,
    private readonly createProjectUseCase: CreateProjectUseCase,
    private readonly updateProjectUseCase: UpdateProjectUseCase,
    private readonly deleteProjectUseCase: DeleteProjectUseCase,
    private readonly getProjectVolunteersUseCase: GetProjectVolunteersUseCase,
  ) {
    this.listProjectsForActor = this.listProjectsForActorUseCase.execute.bind(this.listProjectsForActorUseCase)
    this.getProjectById = this.getProjectByIdUseCase.execute.bind(this.getProjectByIdUseCase)
    this.getProjectForActor = this.getProjectForActorUseCase.execute.bind(this.getProjectForActorUseCase)
    this.canActorAccessProject = this.canActorAccessProjectUseCase.execute.bind(this.canActorAccessProjectUseCase)
    this.canActorManageProject = this.canActorManageProjectUseCase.execute.bind(this.canActorManageProjectUseCase)
    this.createProject = this.createProjectUseCase.execute.bind(this.createProjectUseCase)
    this.updateProject = this.updateProjectUseCase.execute.bind(this.updateProjectUseCase)
    this.deleteProject = this.deleteProjectUseCase.execute.bind(this.deleteProjectUseCase)
    this.getProjectVolunteers = this.getProjectVolunteersUseCase.execute.bind(this.getProjectVolunteersUseCase)
  }
}

export interface ProjectManagementModulePorts {
  projects: ProjectRepositoryPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
  hours: ProjectHoursPort
}

export interface ProjectManagementModuleFactoryOptions {
  ports?: Partial<ProjectManagementModulePorts>
}

export function createProjectManagementModule(options: ProjectManagementModuleFactoryOptions = {}) {
  const ports: ProjectManagementModulePorts = {
    projects: options.ports?.projects ?? createPrismaProjectRepository(),
    memberships: options.ports?.memberships ?? createPrismaProjectManagementMembershipRepository(),
    actors: options.ports?.actors ?? createPrismaProjectActorsPort(),
    hours: options.ports?.hours ?? createPrismaProjectHoursPort(),
  }

  return new ProjectManagementModule(
    new ListProjectsForActorUseCase({ projects: ports.projects }),
    new GetProjectByIdUseCase({ projects: ports.projects }),
    new GetProjectForActorUseCase({ projects: ports.projects, actors: ports.actors }),
    new CanActorAccessProjectUseCase({ actors: ports.actors }),
    new CanActorManageProjectUseCase({ memberships: ports.memberships, actors: ports.actors }),
    new CreateProjectUseCase({ projects: ports.projects, memberships: ports.memberships }),
    new UpdateProjectUseCase({ projects: ports.projects, memberships: ports.memberships, actors: ports.actors }),
    new DeleteProjectUseCase({ projects: ports.projects, memberships: ports.memberships, actors: ports.actors }),
    new GetProjectVolunteersUseCase({ memberships: ports.memberships, actors: ports.actors, hours: ports.hours }),
  )
}
