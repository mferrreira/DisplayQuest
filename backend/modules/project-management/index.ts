import { ListProjectsForActorUseCase } from "@/backend/modules/project-management/application/use-cases/list-projects-for-actor.use-case"
import { GetProjectByIdUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-by-id.use-case"
import { GetProjectForActorUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-for-actor.use-case"
import { CanActorAccessProjectUseCase } from "@/backend/modules/project-management/application/use-cases/can-actor-access-project.use-case"
import { CreateProjectUseCase } from "@/backend/modules/project-management/application/use-cases/create-project.use-case"
import { UpdateProjectUseCase } from "@/backend/modules/project-management/application/use-cases/update-project.use-case"
import { DeleteProjectUseCase } from "@/backend/modules/project-management/application/use-cases/delete-project.use-case"
import { GetProjectVolunteersUseCase } from "@/backend/modules/project-management/application/use-cases/get-project-volunteers.use-case"
import { createProjectManagementGateway } from "@/backend/modules/project-management/infrastructure/project-management.gateway"

type UseCaseExecute<T> = T extends { execute: (...args: infer A) => infer R } ? (...args: A) => R : never

export class ProjectManagementModule {
  readonly listProjectsForActor: UseCaseExecute<ListProjectsForActorUseCase>
  readonly getProjectById: UseCaseExecute<GetProjectByIdUseCase>
  readonly getProjectForActor: UseCaseExecute<GetProjectForActorUseCase>
  readonly canActorAccessProject: UseCaseExecute<CanActorAccessProjectUseCase>
  readonly createProject: UseCaseExecute<CreateProjectUseCase>
  readonly updateProject: UseCaseExecute<UpdateProjectUseCase>
  readonly deleteProject: UseCaseExecute<DeleteProjectUseCase>
  readonly getProjectVolunteers: UseCaseExecute<GetProjectVolunteersUseCase>

  constructor(
    private readonly listProjectsForActorUseCase: ListProjectsForActorUseCase,
    private readonly getProjectByIdUseCase: GetProjectByIdUseCase,
    private readonly getProjectForActorUseCase: GetProjectForActorUseCase,
    private readonly canActorAccessProjectUseCase: CanActorAccessProjectUseCase,
    private readonly createProjectUseCase: CreateProjectUseCase,
    private readonly updateProjectUseCase: UpdateProjectUseCase,
    private readonly deleteProjectUseCase: DeleteProjectUseCase,
    private readonly getProjectVolunteersUseCase: GetProjectVolunteersUseCase,
  ) {
    this.listProjectsForActor = this.listProjectsForActorUseCase.execute.bind(this.listProjectsForActorUseCase)
    this.getProjectById = this.getProjectByIdUseCase.execute.bind(this.getProjectByIdUseCase)
    this.getProjectForActor = this.getProjectForActorUseCase.execute.bind(this.getProjectForActorUseCase)
    this.canActorAccessProject = this.canActorAccessProjectUseCase.execute.bind(this.canActorAccessProjectUseCase)
    this.createProject = this.createProjectUseCase.execute.bind(this.createProjectUseCase)
    this.updateProject = this.updateProjectUseCase.execute.bind(this.updateProjectUseCase)
    this.deleteProject = this.deleteProjectUseCase.execute.bind(this.deleteProjectUseCase)
    this.getProjectVolunteers = this.getProjectVolunteersUseCase.execute.bind(this.getProjectVolunteersUseCase)
  }
}

export function createProjectManagementModule() {
  const gateway = createProjectManagementGateway()
  return new ProjectManagementModule(
    new ListProjectsForActorUseCase(gateway),
    new GetProjectByIdUseCase(gateway),
    new GetProjectForActorUseCase(gateway),
    new CanActorAccessProjectUseCase(gateway),
    new CreateProjectUseCase(gateway),
    new UpdateProjectUseCase(gateway),
    new DeleteProjectUseCase(gateway),
    new GetProjectVolunteersUseCase(gateway),
  )
}
