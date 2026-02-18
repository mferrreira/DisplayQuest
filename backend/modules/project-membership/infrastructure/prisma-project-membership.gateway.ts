import { prisma } from "@/lib/database/prisma"
import { normalizeRoles, type Role } from "@/lib/auth/rbac"
import type { UserRole } from "@prisma/client"
import type {
  AddProjectMemberCommand,
  AssignProjectLeaderCommand,
  CreatedProjectMemberView,
  ListProjectMembersQuery,
  ProjectLeaderView,
  ProjectMemberView,
  RemoveProjectMemberCommand,
  UpsertProjectMemberRolesCommand,
} from "@/backend/modules/project-membership/application/contracts"
import type { ProjectMembershipGateway } from "@/backend/modules/project-membership/application/ports/project-membership.gateway"

const GLOBAL_PROJECT_MANAGERS: Role[] = ["COORDENADOR", "GERENTE"]

export class PrismaProjectMembershipGateway implements ProjectMembershipGateway {
  async listProjectMembers(query: ListProjectMembersQuery): Promise<ProjectMemberView[]> {
    const canView = await this.canViewProjectMembers(query.projectId, query.actorUserId, query.actorRoles)
    if (!canView) {
      throw new Error("Acesso negado ao projeto")
    }

    const members = await prisma.project_members.findMany({
      where: { projectId: query.projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    })

    const totalHoursByUser = await prisma.work_sessions.groupBy({
      by: ["userId"],
      where: {
        projectId: query.projectId,
        status: "completed",
      },
      _sum: { duration: true },
    })

    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    startOfWeek.setHours(0, 0, 0, 0)

    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    endOfWeek.setHours(23, 59, 59, 999)

    const weekHoursByUser = await prisma.work_sessions.groupBy({
      by: ["userId"],
      where: {
        projectId: query.projectId,
        status: "completed",
        startTime: {
          gte: startOfWeek,
          lte: endOfWeek,
        },
      },
      _sum: { duration: true },
    })

    const totalHoursMap = new Map<number, number>(
      totalHoursByUser.map((item) => [item.userId, (item._sum.duration || 0) / 3600]),
    )
    const weekHoursMap = new Map<number, number>(
      weekHoursByUser.map((item) => [item.userId, (item._sum.duration || 0) / 3600]),
    )

    return members.map((member) => ({
      id: member.id,
      userId: member.userId,
      userName: member.user?.name ?? null,
      userEmail: member.user?.email ?? null,
      roles: member.roles,
      joinedAt: member.joinedAt.toISOString(),
      totalHours: Math.round((totalHoursMap.get(member.userId) || 0) * 100) / 100,
      currentWeekHours: Math.round((weekHoursMap.get(member.userId) || 0) * 100) / 100,
    }))
  }

  async addProjectMember(command: AddProjectMemberCommand): Promise<CreatedProjectMemberView> {
    const canManage = await this.canManageProjectMembers(command.projectId, command.actorUserId, command.actorRoles)
    if (!canManage) {
      throw new Error("Apenas coordenadores, gerentes ou gerente do projeto podem adicionar membros")
    }

    if (!command.roles || command.roles.length === 0) {
      throw new Error("userId e roles são obrigatórios")
    }

    await this.ensureProjectExists(command.projectId)
    await this.ensureUserExists(command.targetUserId)

    const roles = normalizeRoles(command.roles) as UserRole[]
    if (roles.length === 0) {
      throw new Error("Nenhum papel válido informado")
    }

    const existingMembership = await prisma.project_members.findUnique({
      where: {
        projectId_userId: {
          projectId: command.projectId,
          userId: command.targetUserId,
        },
      },
      select: { id: true },
    })

    if (existingMembership) {
      throw new Error("Usuário já é membro deste projeto")
    }

    const membership = await prisma.project_members.create({
      data: {
        projectId: command.projectId,
        userId: command.targetUserId,
        roles,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return {
      id: membership.id,
      userId: membership.userId,
      userName: membership.user?.name ?? null,
      userEmail: membership.user?.email ?? null,
      roles: membership.roles,
      joinedAt: membership.joinedAt.toISOString(),
    }
  }

  async upsertProjectMemberRoles(command: UpsertProjectMemberRolesCommand): Promise<CreatedProjectMemberView> {
    const canManage = await this.canManageProjectMembers(command.projectId, command.actorUserId, command.actorRoles)
    if (!canManage) {
      throw new Error("Apenas coordenadores, gerentes ou gerente do projeto podem atualizar papéis")
    }

    await this.ensureProjectExists(command.projectId)
    await this.ensureUserExists(command.targetUserId)

    const roles = normalizeRoles(command.roles) as UserRole[]
    if (roles.length === 0) {
      throw new Error("Nenhum papel válido informado")
    }

    const existingMembership = await prisma.project_members.findUnique({
      where: {
        projectId_userId: {
          projectId: command.projectId,
          userId: command.targetUserId,
        },
      },
      select: { id: true },
    })

    const membership = existingMembership
      ? await prisma.project_members.update({
          where: { id: existingMembership.id },
          data: { roles },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        })
      : await prisma.project_members.create({
          data: {
            projectId: command.projectId,
            userId: command.targetUserId,
            roles,
          },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        })

    return {
      id: membership.id,
      userId: membership.userId,
      userName: membership.user?.name ?? null,
      userEmail: membership.user?.email ?? null,
      roles: membership.roles,
      joinedAt: membership.joinedAt.toISOString(),
    }
  }

  async assignProjectLeader(command: AssignProjectLeaderCommand): Promise<ProjectLeaderView> {
    const canManage = await this.canManageProjectMembers(command.projectId, command.actorUserId, command.actorRoles)
    if (!canManage) {
      throw new Error("Apenas coordenadores, gerentes ou gerente do projeto podem definir líder")
    }

    await this.ensureProjectExists(command.projectId)

    if (command.targetUserId !== null) {
      await this.ensureUserExists(command.targetUserId)
      await this.ensureLeaderIsNotAssignedToAnotherProject(command.projectId, command.targetUserId)

      const existingMembership = await prisma.project_members.findUnique({
        where: {
          projectId_userId: {
            projectId: command.projectId,
            userId: command.targetUserId,
          },
        },
        select: { id: true, roles: true },
      })

      if (!existingMembership) {
        await prisma.project_members.create({
          data: {
            projectId: command.projectId,
            userId: command.targetUserId,
            roles: ["GERENTE_PROJETO"],
          },
        })
      } else if (!existingMembership.roles.includes("GERENTE_PROJETO")) {
        await prisma.project_members.update({
          where: { id: existingMembership.id },
          data: { roles: Array.from(new Set([...existingMembership.roles, "GERENTE_PROJETO"])) as UserRole[] },
        })
      }
    }

    const updatedProject = await prisma.projects.update({
      where: { id: command.projectId },
      data: { leaderId: command.targetUserId },
      select: { id: true, leaderId: true },
    })

    return {
      projectId: updatedProject.id,
      leaderId: updatedProject.leaderId,
    }
  }

  async removeProjectMember(command: RemoveProjectMemberCommand): Promise<{ memberName: string | null }> {
    const canManage = await this.canManageProjectMembers(command.projectId, command.actorUserId, command.actorRoles)
    if (!canManage) {
      throw new Error("Apenas coordenadores, gerentes ou gerente do projeto podem remover membros")
    }

    const membership = await prisma.project_members.findFirst({
      where: {
        id: command.membershipId,
        projectId: command.projectId,
      },
      include: {
        user: {
          select: { name: true },
        },
      },
    })

    if (!membership) {
      throw new Error("Membro não encontrado no projeto")
    }

    if (membership.roles.includes("GERENTE_PROJETO")) {
      const managerCount = await prisma.project_members.count({
        where: {
          projectId: command.projectId,
          roles: { has: "GERENTE_PROJETO" },
        },
      })

      if (managerCount <= 1) {
        throw new Error("Não é possível remover o último gerente do projeto")
      }
    }

    await prisma.project_members.delete({
      where: { id: command.membershipId },
    })

    return { memberName: membership.user?.name ?? null }
  }

  private async canViewProjectMembers(projectId: number, actorUserId: number, actorRoles: Role[]) {
    if (this.hasGlobalProjectPermission(actorRoles)) {
      return true
    }

    const membership = await prisma.project_members.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: actorUserId,
        },
      },
      select: { id: true },
    })

    return Boolean(membership)
  }

  private async canManageProjectMembers(projectId: number, actorUserId: number, actorRoles: Role[]) {
    if (this.hasGlobalProjectPermission(actorRoles)) {
      return true
    }

    const membership = await prisma.project_members.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: actorUserId,
        },
      },
      select: { roles: true },
    })

    return Boolean(membership?.roles.includes("GERENTE_PROJETO"))
  }

  private hasGlobalProjectPermission(actorRoles: Role[]) {
    return actorRoles.some((role) => GLOBAL_PROJECT_MANAGERS.includes(role))
  }

  private async ensureProjectExists(projectId: number) {
    const project = await prisma.projects.findUnique({
      where: { id: projectId },
      select: { id: true },
    })

    if (!project) {
      throw new Error("Projeto não encontrado")
    }
  }

  private async ensureUserExists(userId: number) {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true },
    })

    if (!user) {
      throw new Error("Usuário não encontrado")
    }
  }

  private async ensureLeaderIsNotAssignedToAnotherProject(projectId: number, targetUserId: number) {
    const conflictProject = await prisma.projects.findFirst({
      where: {
        leaderId: targetUserId,
        id: { not: projectId },
      },
      select: { id: true },
    })

    if (conflictProject) {
      throw new Error("Este usuário já é líder de outro projeto. Um usuário só pode ser líder de um projeto por vez.")
    }
  }
}

export function createProjectMembershipGateway() {
  return new PrismaProjectMembershipGateway()
}
