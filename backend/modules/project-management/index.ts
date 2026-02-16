import type {
  CreateProjectCommand,
  DeleteProjectCommand,
  GetProjectForActorQuery,
  GetProjectVolunteersQuery,
  ListProjectsForActorQuery,
  UpdateProjectCommand,
} from "@/backend/modules/project-management/application/contracts"
import type { ProjectManagementGateway } from "@/backend/modules/project-management/application/ports/project-management.gateway"
import { createProjectManagementGateway } from "@/backend/modules/project-management/infrastructure/project-management.gateway"

export class ProjectManagementModule {
  constructor(private readonly gateway: ProjectManagementGateway) {}

  async listProjectsForActor(query: ListProjectsForActorQuery) {
    return await this.gateway.listProjectsForActor(query)
  }

  async getProjectById(projectId: number) {
    return await this.gateway.getProjectById(projectId)
  }

  async getProjectForActor(query: GetProjectForActorQuery) {
    return await this.gateway.getProjectForActor(query)
  }

  async canActorAccessProject(projectId: number, actorId: number, actorRoles: unknown) {
    return await this.gateway.canActorAccessProject(projectId, actorId, actorRoles)
  }

  async createProject(command: CreateProjectCommand) {
    return await this.gateway.createProject(command)
  }

  async updateProject(command: UpdateProjectCommand) {
    return await this.gateway.updateProject(command)
  }

  async deleteProject(command: DeleteProjectCommand) {
    await this.gateway.deleteProject(command)
  }

  async getProjectVolunteers(query: GetProjectVolunteersQuery) {
    return await this.gateway.getProjectVolunteers(query)
  }
}

export function createProjectManagementModule() {
  return new ProjectManagementModule(createProjectManagementGateway())
}
