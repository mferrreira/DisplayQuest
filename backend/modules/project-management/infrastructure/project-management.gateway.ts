import { UserRole } from "@prisma/client"
import { prisma } from "@/lib/database/prisma"
import { hasPermission } from "@/lib/auth/rbac"
import { Project } from "@/backend/models/Project"
import { ProjectMembership } from "@/backend/models/ProjectMembership"
import { createIdentityAccessModule, type IdentityAccessModule } from "@/backend/modules/identity-access"
import { ProjectRepository } from "@/backend/repositories/ProjectRepository"
import { ProjectMembershipRepository } from "@/backend/repositories/ProjectMembershipRepository"
import { UserRepository } from "@/backend/repositories/UserRepository"
import type {
  CreateProjectCommand,
  DeleteProjectCommand,
  UpdateProjectCommand,
} from "@/backend/modules/project-management/application/contracts"
import type { ProjectManagementGateway, ProjectRecord } from "@/backend/modules/project-management/application/ports/project-management.gateway"

export class ProjectServiceGateway implements ProjectManagementGateway {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly membershipRepository: ProjectMembershipRepository,
    private readonly userRepository: UserRepository,
    private readonly identityAccess: IdentityAccessModule,
  ) {}

  async listAllProjects(): Promise<ProjectRecord[]> {
    return await this.projectRepository.findAll() as unknown as ProjectRecord[]
  }

  async listProjectsByUser(actorId: number): Promise<ProjectRecord[]> {
    return await this.projectRepository.findByUserId(actorId) as unknown as ProjectRecord[]
  }

  async listProjectsByCreator(actorId: number): Promise<ProjectRecord[]> {
    return await this.projectRepository.findByCreatorId(actorId) as unknown as ProjectRecord[]
  }

  async getProjectById(projectId: number) {
    return await this.projectRepository.findById(projectId) as unknown as ProjectRecord | null
  }

  async canActorAccessProject(projectId: number, actorId: number, actorRoles: unknown): Promise<boolean> {
    if (hasPermission(actorRoles, "MANAGE_USERS") || hasPermission(actorRoles, "MANAGE_PROJECTS")) {
      return true
    }

    const membership = await prisma.project_members.findFirst({
      where: { projectId, userId: actorId },
      select: { id: true },
    })

    if (membership) return true

    const project = await prisma.projects.findUnique({
      where: { id: projectId },
      select: { leaderId: true, createdBy: true },
    })

    return Boolean(project && (project.leaderId === actorId || project.createdBy === actorId))
  }

  async createProject(command: CreateProjectCommand) {
    const project = Project.create({
      ...command.data,
      createdBy: command.actorId,
    })

    const createdProject = await this.projectRepository.create(project)

    const creatorMembership = ProjectMembership.create({
      projectId: createdProject.id!,
      userId: command.actorId,
      roles: ["GERENTE_PROJETO"],
    })

    await this.membershipRepository.create(creatorMembership)

    if (command.data.leaderId && command.data.leaderId !== command.actorId) {
      await this.ensureProjectMembership(createdProject.id!, command.data.leaderId, ["GERENTE_PROJETO"])
    }

    if (command.volunteerIds && command.volunteerIds.length > 0) {
      const normalizedVolunteers = Array.from(
        new Set(command.volunteerIds.filter((id) => typeof id === "number" && id > 0)),
      )

      for (const volunteerId of normalizedVolunteers) {
        if (volunteerId === command.actorId || volunteerId === command.data.leaderId) {
          continue
        }

        try {
          await this.ensureProjectMembership(createdProject.id!, volunteerId, ["VOLUNTARIO"])
        } catch (error) {
          console.error(`Erro ao adicionar voluntário ${volunteerId} ao projeto ${createdProject.id}:`, error)
        }
      }
    }

    return createdProject as unknown as ProjectRecord
  }

  async updateProject(command: UpdateProjectCommand) {
    const project = await this.projectRepository.findById(command.projectId)
    if (!project) {
      throw new Error("Projeto não encontrado")
    }

    const canManage = await this.canActorManageProject(command.projectId, command.actorId)
    if (!canManage) {
      throw new Error("Usuário não tem permissão para gerenciar este projeto")
    }

    const data = command.data

    if (data.name !== undefined) project.name = String(data.name)
    if (data.description !== undefined) project.description = data.description ? String(data.description) : null
    if (data.status !== undefined) project.status = data.status as any
    if (data.links !== undefined) project.links = data.links as any

    if (data.leaderId !== undefined) {
      if (data.leaderId !== null) {
        const existingLeaderProjects = await this.projectRepository.findByLeaderId(Number(data.leaderId))
        const otherProjects = existingLeaderProjects.filter((candidate) => candidate.id !== command.projectId)
        if (otherProjects.length > 0) {
          throw new Error("Este usuário já é líder de outro projeto. Um usuário só pode ser líder de um projeto por vez.")
        }
      }

      project.leaderId = data.leaderId as number | null
    }

    const updated = await this.projectRepository.update(project)
    return updated as unknown as ProjectRecord
  }

  async deleteProject(command: DeleteProjectCommand) {
    const project = await this.projectRepository.findById(command.projectId)
    if (!project) {
      throw new Error("Projeto não encontrado")
    }

    const canManage = await this.canActorManageProject(command.projectId, command.actorId)
    if (!canManage) {
      throw new Error("Usuário não tem permissão para excluir este projeto")
    }

    const canDeleteStatus = ["active", "archived", "on_hold"].includes(project.status)
    if (!canDeleteStatus) {
      throw new Error("Projeto não pode ser excluído no status atual")
    }

    await this.projectRepository.delete(command.projectId)
  }

  async canActorManageProject(projectId: number, actorId: number) {
    const membership = await this.membershipRepository.findByProjectAndUser(projectId, actorId)
    if (membership) {
      return membership.roles.some((role) => ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"].includes(role))
    }

    const user = await this.userRepository.findById(actorId)
    if (!user) return false

    return this.identityAccess.hasPermission(user.roles, "MANAGE_USERS")
  }

  async getProjectVolunteersStats(projectId: number) {
    const members = await this.membershipRepository.getProjectMembersWithDetails(projectId)
    const volunteersOnly = members.filter((member) =>
      member.roles?.includes("VOLUNTARIO") || member.roles?.includes("COLABORADOR"),
    )

    const volunteers = []
    for (const member of volunteersOnly) {
      const totalSessions = await prisma.work_sessions.findMany({
        where: {
          userId: member.userId,
          projectId,
          status: "completed",
        },
        select: { duration: true },
      })

      const totalSeconds = totalSessions.reduce((sum, session) => sum + (session.duration || 0), 0)
      const totalHours = totalSeconds / 3600

      const now = new Date()
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7))
      weekStart.setHours(0, 0, 0, 0)

      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)

      const weekSessions = await prisma.work_sessions.findMany({
        where: {
          userId: member.userId,
          projectId,
          status: "completed",
          startTime: {
            gte: weekStart,
            lte: weekEnd,
          },
        },
        select: { duration: true },
      })

      const weekSeconds = weekSessions.reduce((sum, session) => sum + (session.duration || 0), 0)
      const currentWeekHours = weekSeconds / 3600

      volunteers.push({
        id: member.userId,
        name: member.user?.name || "Usuário",
        email: member.user?.email || "",
        avatar: member.user?.avatar,
        role: member.roles?.[0] || "VOLUNTARIO",
        joinedAt: member.joinedAt,
        hoursWorked: Math.round(totalHours * 100) / 100,
        currentWeekHours: Math.round(currentWeekHours * 100) / 100,
        tasksCompleted: member.user?.completedTasks || 0,
        pointsEarned: member.user?.points || 0,
        status: "active" as const,
        lastActivity: new Date().toISOString().split("T")[0],
      })
    }

    const totalVolunteers = volunteers.length
    const totalHours = volunteers.reduce((sum, volunteer) => sum + volunteer.hoursWorked, 0)
    const completedTasks = volunteers.reduce((sum, volunteer) => sum + volunteer.tasksCompleted, 0)
    const totalPoints = volunteers.reduce((sum, volunteer) => sum + volunteer.pointsEarned, 0)

    return {
      volunteers,
      stats: {
        totalVolunteers,
        totalHours: Math.round(totalHours * 100) / 100,
        completedTasks,
        totalPoints,
      },
    }
  }

  private async ensureProjectMembership(projectId: number, userId: number, roles: UserRole[]) {
    const existingMembership = await this.membershipRepository.findByProjectAndUser(projectId, userId)
    const uniqueRoles = (values: UserRole[]) => Array.from(new Set(values)) as UserRole[]

    if (existingMembership) {
      const mergedRoles = uniqueRoles([...existingMembership.roles, ...roles])
      existingMembership.roles = mergedRoles
      return await this.membershipRepository.update(existingMembership)
    }

    const membership = ProjectMembership.create({
      projectId,
      userId,
      roles: uniqueRoles(roles),
    })

    return await this.membershipRepository.create(membership)
  }
}

export function createProjectManagementGateway() {
  return new ProjectServiceGateway(
    new ProjectRepository(),
    new ProjectMembershipRepository(),
    new UserRepository(),
    createIdentityAccessModule(),
  )
}
