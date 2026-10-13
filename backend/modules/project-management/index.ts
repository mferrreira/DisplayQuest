import { ListProjectsForActorUseCase } from "@/backend/modules/project-management/application/use-cases/list-projects-for-actor.use-case"
import { GetProjectByIdUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-by-id.use-case"
import { GetProjectForActorUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-for-actor.use-case"
import { CanActorAccessProjectUseCase } from "@/backend/modules/project-management/application/use-cases/can-actor-access-project.use-case"
import { CanActorManageProjectUseCase } from "@/backend/modules/project-management/application/use-cases/can-actor-manage-project.use-case"
import { CreateProjectUseCase } from "@/backend/modules/project-management/application/use-cases/create-project.use-case"
import { AssertCanCreateProjectUseCase } from "@/backend/modules/project-management/application/use-cases/assert-can-create-project.use-case"
import { UpdateProjectUseCase } from "@/backend/modules/project-management/application/use-cases/update-project.use-case"
import { DeleteProjectUseCase } from "@/backend/modules/project-management/application/use-cases/delete-project.use-case"
import { GetProjectVolunteersUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-volunteers.use-case"
import { ListProjectDeliverablesUseCase } from "@/backend/modules/project-management/application/use-cases/list-project-deliverables.use-case"
import { CreateProjectDeliverableUseCase } from "@/backend/modules/project-management/application/use-cases/create-project-deliverable.use-case"
import { UpdateProjectDeliverableUseCase } from "@/backend/modules/project-management/application/use-cases/update-project-deliverable.use-case"
import { DeleteProjectDeliverableUseCase } from "@/backend/modules/project-management/application/use-cases/delete-project-deliverable.use-case"
import { ListProjectAttachmentsUseCase } from "@/backend/modules/project-management/application/use-cases/list-project-attachments.use-case"
import { GetProjectAttachmentUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-attachment.use-case"
import { AddProjectAttachmentUseCase } from "@/backend/modules/project-management/application/use-cases/add-project-attachment.use-case"
import { RemoveProjectAttachmentUseCase } from "@/backend/modules/project-management/application/use-cases/remove-project-attachment.use-case"
import { AssertCanManageProjectUseCase } from "@/backend/modules/project-management/application/use-cases/assert-can-manage-project.use-case"
import { UpdateProjectImageUseCase } from "@/backend/modules/project-management/application/use-cases/update-project-image.use-case"
import { GetProjectImageUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-image.use-case"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type { ProjectAttachmentsPort } from "@/backend/modules/project-management/application/ports/project-attachments.repository"
import type { ProjectDeliverablesPort } from "@/backend/modules/project-management/application/ports/project-deliverables.repository"
import type { ProjectHoursPort } from "@/backend/modules/project-management/application/ports/project-hours.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"
import { createPrismaProjectActorsPort } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project-actors.port"
import { createPrismaProjectAttachmentsRepository } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project-attachments.repository"
import { createPrismaProjectDeliverablesRepository } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project-deliverables.repository"
import { createPrismaProjectHoursPort } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project-hours.port"
import { createPrismaProjectManagementMembershipRepository } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project-membership.repository"
import { createPrismaProjectRepository } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project.repository"

/**
 * ProjectManagementModule — OND5-B2 (R1/R2). The use cases now HOLD the rules (frozen by
 * the golden matrix OND5-B1) over thin ports; the module surface for the routes is
 * UNCHANGED. The legacy `ProjectServiceGateway` was removed in OND9-B1 (repo-cleanup B8,
 * 2026-10-01) together with the contract suite — old behavior preserved in git (tag
 * `pre-cleanup`).
 *
 * V5-2c acrescenta entregáveis e anexos. O módulo continua sem saber o que é bucket: os
 * use cases de anexo mexem só no metadado, e quem move byte é a rota pelo seam
 * `lib/storage/blob-store.ts` (DEC-101) — mesma separação medida em `project-reports`.
 */

type UseCaseExecute<T> = T extends { execute: (...args: infer A) => infer R } ? (...args: A) => R : never

export class ProjectManagementModule {
  readonly listProjectsForActor: UseCaseExecute<ListProjectsForActorUseCase>
  readonly getProjectById: UseCaseExecute<GetProjectByIdUseCase>
  readonly getProjectForActor: UseCaseExecute<GetProjectForActorUseCase>
  readonly canActorAccessProject: UseCaseExecute<CanActorAccessProjectUseCase>
  readonly canActorManageProject: UseCaseExecute<CanActorManageProjectUseCase>
  readonly createProject: UseCaseExecute<CreateProjectUseCase>
  readonly assertCanCreateProject: UseCaseExecute<AssertCanCreateProjectUseCase>
  readonly updateProject: UseCaseExecute<UpdateProjectUseCase>
  readonly deleteProject: UseCaseExecute<DeleteProjectUseCase>
  readonly getProjectVolunteers: UseCaseExecute<GetProjectVolunteersUseCase>
  readonly listProjectDeliverables: UseCaseExecute<ListProjectDeliverablesUseCase>
  readonly createProjectDeliverable: UseCaseExecute<CreateProjectDeliverableUseCase>
  readonly updateProjectDeliverable: UseCaseExecute<UpdateProjectDeliverableUseCase>
  readonly deleteProjectDeliverable: UseCaseExecute<DeleteProjectDeliverableUseCase>
  readonly listProjectAttachments: UseCaseExecute<ListProjectAttachmentsUseCase>
  readonly getProjectAttachment: UseCaseExecute<GetProjectAttachmentUseCase>
  readonly addProjectAttachment: UseCaseExecute<AddProjectAttachmentUseCase>
  readonly removeProjectAttachment: UseCaseExecute<RemoveProjectAttachmentUseCase>
  readonly assertCanManageProject: UseCaseExecute<AssertCanManageProjectUseCase>
  readonly updateProjectImage: UseCaseExecute<UpdateProjectImageUseCase>
  readonly getProjectImage: UseCaseExecute<GetProjectImageUseCase>

  constructor(
    private readonly listProjectsForActorUseCase: ListProjectsForActorUseCase,
    private readonly getProjectByIdUseCase: GetProjectByIdUseCase,
    private readonly getProjectForActorUseCase: GetProjectForActorUseCase,
    private readonly canActorAccessProjectUseCase: CanActorAccessProjectUseCase,
    private readonly canActorManageProjectUseCase: CanActorManageProjectUseCase,
    private readonly createProjectUseCase: CreateProjectUseCase,
    private readonly assertCanCreateProjectUseCase: AssertCanCreateProjectUseCase,
    private readonly updateProjectUseCase: UpdateProjectUseCase,
    private readonly deleteProjectUseCase: DeleteProjectUseCase,
    private readonly getProjectVolunteersUseCase: GetProjectVolunteersUseCase,
    private readonly listProjectDeliverablesUseCase: ListProjectDeliverablesUseCase,
    private readonly createProjectDeliverableUseCase: CreateProjectDeliverableUseCase,
    private readonly updateProjectDeliverableUseCase: UpdateProjectDeliverableUseCase,
    private readonly deleteProjectDeliverableUseCase: DeleteProjectDeliverableUseCase,
    private readonly listProjectAttachmentsUseCase: ListProjectAttachmentsUseCase,
    private readonly getProjectAttachmentUseCase: GetProjectAttachmentUseCase,
    private readonly addProjectAttachmentUseCase: AddProjectAttachmentUseCase,
    private readonly removeProjectAttachmentUseCase: RemoveProjectAttachmentUseCase,
    private readonly assertCanManageProjectUseCase: AssertCanManageProjectUseCase,
    private readonly updateProjectImageUseCase: UpdateProjectImageUseCase,
    private readonly getProjectImageUseCase: GetProjectImageUseCase,
  ) {
    this.listProjectsForActor = this.listProjectsForActorUseCase.execute.bind(this.listProjectsForActorUseCase)
    this.getProjectById = this.getProjectByIdUseCase.execute.bind(this.getProjectByIdUseCase)
    this.getProjectForActor = this.getProjectForActorUseCase.execute.bind(this.getProjectForActorUseCase)
    this.canActorAccessProject = this.canActorAccessProjectUseCase.execute.bind(this.canActorAccessProjectUseCase)
    this.canActorManageProject = this.canActorManageProjectUseCase.execute.bind(this.canActorManageProjectUseCase)
    this.createProject = this.createProjectUseCase.execute.bind(this.createProjectUseCase)
    this.assertCanCreateProject = this.assertCanCreateProjectUseCase.execute.bind(this.assertCanCreateProjectUseCase)
    this.updateProject = this.updateProjectUseCase.execute.bind(this.updateProjectUseCase)
    this.deleteProject = this.deleteProjectUseCase.execute.bind(this.deleteProjectUseCase)
    this.getProjectVolunteers = this.getProjectVolunteersUseCase.execute.bind(this.getProjectVolunteersUseCase)
    this.listProjectDeliverables = this.listProjectDeliverablesUseCase.execute.bind(this.listProjectDeliverablesUseCase)
    this.createProjectDeliverable = this.createProjectDeliverableUseCase.execute.bind(this.createProjectDeliverableUseCase)
    this.updateProjectDeliverable = this.updateProjectDeliverableUseCase.execute.bind(this.updateProjectDeliverableUseCase)
    this.deleteProjectDeliverable = this.deleteProjectDeliverableUseCase.execute.bind(this.deleteProjectDeliverableUseCase)
    this.listProjectAttachments = this.listProjectAttachmentsUseCase.execute.bind(this.listProjectAttachmentsUseCase)
    this.getProjectAttachment = this.getProjectAttachmentUseCase.execute.bind(this.getProjectAttachmentUseCase)
    this.addProjectAttachment = this.addProjectAttachmentUseCase.execute.bind(this.addProjectAttachmentUseCase)
    this.removeProjectAttachment = this.removeProjectAttachmentUseCase.execute.bind(this.removeProjectAttachmentUseCase)
    this.assertCanManageProject = this.assertCanManageProjectUseCase.execute.bind(this.assertCanManageProjectUseCase)
    this.updateProjectImage = this.updateProjectImageUseCase.execute.bind(this.updateProjectImageUseCase)
    this.getProjectImage = this.getProjectImageUseCase.execute.bind(this.getProjectImageUseCase)
  }
}

export interface ProjectManagementModulePorts {
  projects: ProjectRepositoryPort
  memberships: ProjectManagementMembershipPort
  actors: ProjectActorsPort
  hours: ProjectHoursPort
  deliverables: ProjectDeliverablesPort
  attachments: ProjectAttachmentsPort
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
    deliverables: options.ports?.deliverables ?? createPrismaProjectDeliverablesRepository(),
    attachments: options.ports?.attachments ?? createPrismaProjectAttachmentsRepository(),
  }

  return new ProjectManagementModule(
    new ListProjectsForActorUseCase({ projects: ports.projects }),
    new GetProjectByIdUseCase({ projects: ports.projects }),
    new GetProjectForActorUseCase({ projects: ports.projects, actors: ports.actors }),
    new CanActorAccessProjectUseCase({ actors: ports.actors }),
    new CanActorManageProjectUseCase({ memberships: ports.memberships, actors: ports.actors }),
    new CreateProjectUseCase({ projects: ports.projects, memberships: ports.memberships }),
    new AssertCanCreateProjectUseCase(),
    new UpdateProjectUseCase({ projects: ports.projects, memberships: ports.memberships, actors: ports.actors }),
    new DeleteProjectUseCase({ projects: ports.projects, memberships: ports.memberships, actors: ports.actors }),
    new GetProjectVolunteersUseCase({ memberships: ports.memberships, actors: ports.actors, hours: ports.hours }),
    new ListProjectDeliverablesUseCase({
      projects: ports.projects,
      deliverables: ports.deliverables,
      actors: ports.actors,
    }),
    new CreateProjectDeliverableUseCase({
      projects: ports.projects,
      deliverables: ports.deliverables,
      memberships: ports.memberships,
      actors: ports.actors,
    }),
    new UpdateProjectDeliverableUseCase({
      projects: ports.projects,
      deliverables: ports.deliverables,
      memberships: ports.memberships,
      actors: ports.actors,
    }),
    new DeleteProjectDeliverableUseCase({
      projects: ports.projects,
      deliverables: ports.deliverables,
      memberships: ports.memberships,
      actors: ports.actors,
    }),
    new ListProjectAttachmentsUseCase({
      projects: ports.projects,
      attachments: ports.attachments,
      actors: ports.actors,
    }),
    new GetProjectAttachmentUseCase({
      projects: ports.projects,
      attachments: ports.attachments,
      actors: ports.actors,
    }),
    new AddProjectAttachmentUseCase({
      projects: ports.projects,
      attachments: ports.attachments,
      memberships: ports.memberships,
      actors: ports.actors,
    }),
    new RemoveProjectAttachmentUseCase({
      projects: ports.projects,
      attachments: ports.attachments,
      memberships: ports.memberships,
      actors: ports.actors,
    }),
    new AssertCanManageProjectUseCase({
      projects: ports.projects,
      memberships: ports.memberships,
      actors: ports.actors,
    }),
    new UpdateProjectImageUseCase({
      projects: ports.projects,
      memberships: ports.memberships,
      actors: ports.actors,
    }),
    new GetProjectImageUseCase({
      projects: ports.projects,
      actors: ports.actors,
    }),
  )
}
