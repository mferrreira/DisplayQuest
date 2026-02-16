import type {
  CreateProjectCommand,
  DeleteProjectCommand,
  UpdateProjectCommand,
} from "@/backend/modules/project-management/application/contracts"

export type ProjectRecord = {
  id?: number | null
} & Record<string, unknown>

export interface ProjectManagementGateway {
  listAllProjects(): Promise<ProjectRecord[]>
  listProjectsByUser(actorId: number): Promise<ProjectRecord[]>
  listProjectsByCreator(actorId: number): Promise<ProjectRecord[]>
  getProjectById(projectId: number): Promise<ProjectRecord | null>
  canActorAccessProject(projectId: number, actorId: number, actorRoles: unknown): Promise<boolean>
  createProject(command: CreateProjectCommand): Promise<ProjectRecord>
  updateProject(command: UpdateProjectCommand): Promise<ProjectRecord>
  deleteProject(command: DeleteProjectCommand): Promise<void>
  canActorManageProject(projectId: number, actorId: number): Promise<boolean>
  getProjectVolunteersStats(projectId: number): Promise<unknown>
}
