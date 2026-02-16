import { ProjectMembershipRepository } from "@/backend/repositories/ProjectMembershipRepository"
import { ProjectRepository } from "@/backend/repositories/ProjectRepository"
import { ProjectService } from "@/backend/services/ProjectService"
import type {
  CreateProjectCommand,
  DeleteProjectCommand,
  GetProjectForActorQuery,
  GetProjectVolunteersQuery,
  ListProjectsForActorQuery,
  UpdateProjectCommand,
} from "@/backend/modules/project-management/application/contracts"
import type { ProjectManagementGateway } from "@/backend/modules/project-management/application/ports/project-management.gateway"
import { hasPermission } from "@/lib/auth/rbac"
import { prisma } from "@/lib/database/prisma"

export class ProjectServiceGateway implements ProjectManagementGateway {
  constructor(private readonly projectService: ProjectService) {}

  async listProjectsForActor(query: ListProjectsForActorQuery): Promise<unknown[]> {
    if (hasPermission(query.actorRoles, "MANAGE_TASKS")) {
      return await this.projectService.findAll()
    }

    const userProjects = await this.projectService.findByUserId(query.actorId)
    const createdProjects = await this.projectService.findByCreatorId(query.actorId)
    const allProjects = [...userProjects, ...createdProjects]

    return allProjects.filter(
      (project, index, self) => index === self.findIndex((candidate) => candidate.id === project.id),
    )
  }

  async getProjectById(projectId: number) {
    return await this.projectService.findById(projectId)
  }

  async getProjectForActor(query: GetProjectForActorQuery) {
    const project = await this.projectService.findById(query.projectId)
    if (!project) {
      throw new Error("Projeto não encontrado")
    }

    if (hasPermission(query.actorRoles, "MANAGE_PROJECTS")) {
      return project
    }

    const canAccess = await this.canActorAccessProject(query.projectId, query.actorId, query.actorRoles)
    if (!canAccess) {
      throw new Error("Acesso negado ao projeto")
    }

    return project
  }

  async canActorAccessProject(projectId: number, actorId: number, actorRoles: unknown): Promise<boolean> {
    if (hasPermission(actorRoles, "MANAGE_USERS") || hasPermission(actorRoles, "MANAGE_PROJECTS")) {
      return true
    }

    const membership = await prisma.project_members.findFirst({
      where: {
        projectId,
        userId: actorId,
      },
      select: { id: true },
    })

    if (membership) {
      return true
    }

    const project = await prisma.projects.findUnique({
      where: { id: projectId },
      select: { leaderId: true, createdBy: true },
    })

    return Boolean(project && (project.leaderId === actorId || project.createdBy === actorId))
  }

  async createProject(command: CreateProjectCommand) {
    return await this.projectService.create(command.data, command.actorId, {
      volunteerIds: command.volunteerIds,
    })
  }

  async updateProject(command: UpdateProjectCommand) {
    return await this.projectService.update(command.projectId, command.data, command.actorId)
  }

  async deleteProject(command: DeleteProjectCommand) {
    await this.projectService.delete(command.projectId, command.actorId)
  }

  async getProjectVolunteers(query: GetProjectVolunteersQuery) {
    const canViewAll = hasPermission(query.actorRoles, "MANAGE_PROJECTS")
    const canManageProject = await this.projectService.canUserManageProject(query.projectId, query.actorId)

    if (!canViewAll && !canManageProject) {
      throw new Error("Acesso negado ao projeto")
    }

    return await this.projectService.getVolunteersStats(query.projectId)
  }
}

export function createProjectManagementGateway() {
  return new ProjectServiceGateway(
    new ProjectService(
      new ProjectRepository(),
      new ProjectMembershipRepository(),
    ),
  )
}
