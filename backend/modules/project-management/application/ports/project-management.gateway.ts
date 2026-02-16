import type {
  CreateProjectCommand,
  DeleteProjectCommand,
  GetProjectForActorQuery,
  GetProjectVolunteersQuery,
  ListProjectsForActorQuery,
  UpdateProjectCommand,
} from "@/backend/modules/project-management/application/contracts"

export interface ProjectManagementGateway {
  listProjectsForActor(query: ListProjectsForActorQuery): Promise<unknown[]>
  getProjectById(projectId: number): Promise<unknown | null>
  getProjectForActor(query: GetProjectForActorQuery): Promise<unknown>
  canActorAccessProject(projectId: number, actorId: number, actorRoles: unknown): Promise<boolean>
  createProject(command: CreateProjectCommand): Promise<unknown>
  updateProject(command: UpdateProjectCommand): Promise<unknown>
  deleteProject(command: DeleteProjectCommand): Promise<void>
  getProjectVolunteers(query: GetProjectVolunteersQuery): Promise<unknown>
}
