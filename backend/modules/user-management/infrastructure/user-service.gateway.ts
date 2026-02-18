import type { UserRole } from "@prisma/client"
import { prisma } from "@/lib/database/prisma"
import { hasRole } from "@/lib/auth/rbac"
import { createIdentityAccessModule, type IdentityAccessModule } from "@/backend/modules/identity-access"
import { UserRepository } from "@/backend/repositories/UserRepository"
import type {
  DeductUserHoursCommand,
  ListLeaderboardQuery,
  ListUserProfilesQuery,
  ListUsersForActorQuery,
  UpdateUserPointsCommand,
  UpdateUserRolesCommand,
  UpdateUserStatusCommand,
} from "@/backend/modules/user-management/application/contracts"
import type { UserManagementGateway } from "@/backend/modules/user-management/application/ports/user-management.gateway"

export class UserServiceGateway implements UserManagementGateway {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly identityAccess: IdentityAccessModule,
  ) {}

  async listUsersForActor(query: ListUsersForActorQuery): Promise<unknown[]> {
    const canViewFullUsers = hasRole(query.actorRoles, ["COORDENADOR", "GERENTE"])
    const canManageProjectMembers = hasRole(query.actorRoles, ["GERENTE_PROJETO"])
    const canViewBasicUsers = hasRole(query.actorRoles, [
      "COORDENADOR",
      "GERENTE",
      "GERENTE_PROJETO",
      "PESQUISADOR",
      "VOLUNTARIO",
      "COLABORADOR",
      "LABORATORISTA",
    ])

    if (!canViewBasicUsers) {
      throw new Error("Usuário não tem permissão para visualizar outros usuários")
    }

    return await prisma.users.findMany({
      where: { status: "active" },
      select: {
        id: true,
        name: true,
        email: canViewFullUsers || canManageProjectMembers,
        roles: true,
        status: true,
        weekHours: true,
        points: true,
        completedTasks: true,
        avatar: true,
        bio: canViewFullUsers,
      },
      orderBy: { name: "asc" },
    })
  }

  async findUserById(userId: number) {
    return await this.userRepository.findById(userId)
  }

  async updateUser(userId: number, data: Record<string, unknown>) {
    const currentUser = await this.userRepository.findById(userId)
    if (!currentUser) {
      throw new Error("Usuário não encontrado")
    }

    if (data.name !== undefined) {
      const name = String(data.name || "").trim()
      if (!name) throw new Error("Nome é obrigatório")
      currentUser.name = name
    }

    if (data.email !== undefined) {
      const email = String(data.email || "").trim()
      const existingUser = await this.userRepository.findByEmail(email)
      if (existingUser && existingUser.id !== userId) {
        throw new Error("Email já está em uso")
      }
      if (!email) throw new Error("Email inválido")
      currentUser.email = email.toLowerCase()
    }

    if (data.bio !== undefined) currentUser.bio = data.bio ? String(data.bio) : null
    if (data.avatar !== undefined) currentUser.avatar = data.avatar ? String(data.avatar) : null
    if (data.profileVisibility !== undefined) currentUser.profileVisibility = data.profileVisibility as any
    if (data.weekHours !== undefined) currentUser.weekHours = Number(data.weekHours)
    if (data.status !== undefined) currentUser.status = String(data.status)

    if (data.roles !== undefined && Array.isArray(data.roles)) {
      currentUser.roles = [...new Set(data.roles as UserRole[])]
    }

    return await this.userRepository.update(currentUser)
  }

  async deleteUser(userId: number) {
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    await this.userRepository.delete(userId)
  }

  async listPendingUsers() {
    return await this.userRepository.findPending()
  }

  async moderatePendingUser(userId: number, action: "approve" | "reject") {
    if (action === "approve") {
      const user = await this.userRepository.findById(userId)
      if (!user) throw new Error("Usuário não encontrado")
      user.status = "active"
      return await this.userRepository.update(user)
    }

    return await this.deleteUser(userId)
  }

  async updateUserProfile(userId: number, data: Record<string, unknown>) {
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    if (data.name !== undefined) {
      const name = String(data.name || "").trim()
      if (!name) throw new Error("Nome é obrigatório")
      user.name = name
    }
    if (data.bio !== undefined) user.bio = data.bio ? String(data.bio) : null
    if (data.avatar !== undefined) user.avatar = data.avatar ? String(data.avatar) : null
    if (data.profileVisibility !== undefined) user.profileVisibility = data.profileVisibility as any
    if (data.weekHours !== undefined) user.weekHours = Number(data.weekHours)

    if (data.password !== undefined) {
      const password = String(data.password || "")
      if (password.trim()) {
        await user.setPassword(password)
      }
    }

    return await this.userRepository.update(user)
  }

  async updateUserPoints(command: UpdateUserPointsCommand) {
    const user = await this.userRepository.findById(command.userId)
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    if (command.action === "add") {
      user.points = Math.max(0, user.points + command.points)
    } else if (command.action === "remove") {
      if (command.points < 0) throw new Error("Pontos não podem ser negativos")
      if (user.points < command.points) throw new Error("Usuário não possui pontos suficientes")
      user.points -= command.points
    } else {
      if (command.points < 0) throw new Error("Pontos não podem ser negativos")
      user.points = command.points
    }

    return await this.userRepository.update(user)
  }

  async deductUserHours(command: DeductUserHoursCommand) {
    const user = await this.userRepository.findById(command.userId)
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    const canDeductHours = this.canDeductHours(command.deductedByRoles, command.projectId)
    if (!canDeductHours) {
      throw new Error("Sem permissão para retirar horas")
    }

    if (command.projectId && this.identityAccess.hasAnyRole(command.deductedByRoles, ["GERENTE_PROJETO"])) {
      const membership = await prisma.project_members.findFirst({
        where: {
          userId: command.userId,
          projectId: command.projectId,
        },
        select: { id: true },
      })

      if (!membership) {
        throw new Error("Usuário não pertence ao projeto")
      }
    }

    if (user.currentWeekHours < command.hours) {
      throw new Error("Usuário não possui horas suficientes")
    }

    if (command.hours < 0) throw new Error("Horas não podem ser negativas")
    if (user.weekHours < command.hours) throw new Error("Usuário não possui horas suficientes")
    user.weekHours -= command.hours
    if (user.currentWeekHours > user.weekHours) {
      user.currentWeekHours = user.weekHours
    }
    const updatedUser = await this.userRepository.update(user)

    return {
      message: `${command.hours} horas retiradas com sucesso`,
      user: updatedUser,
    }
  }

  async updateUserRoles(command: UpdateUserRolesCommand) {
    const user = await this.userRepository.findById(command.userId)
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    if (command.action === "add") {
      if (command.role && !user.roles.includes(command.role)) {
        user.roles = [...user.roles, command.role]
      }
    } else if (command.action === "remove") {
      user.roles = user.roles.filter((role) => role !== command.role)
    } else {
      user.roles = [...new Set(command.roles || [])]
    }

    return await this.userRepository.update(user)
  }

  async updateUserStatus(command: UpdateUserStatusCommand) {
    const user = await this.userRepository.findById(command.userId)
    if (!user) {
      throw new Error("Usuário não encontrado")
    }

    if (command.action === "approve") user.status = "active"
    else if (command.action === "reject") user.status = "rejected"
    else if (command.action === "suspend") user.status = "suspended"
    else user.status = "active"

    return await this.userRepository.update(user)
  }

  async listUserStatistics(type?: string | null) {
    switch (type) {
      case "roles":
        return await this.userRepository.getUsersByRole()
      case "status":
        return await this.userRepository.getUsersByStatus()
      case "general":
      default:
        return await this.userRepository.getUserStatistics()
    }
  }

  async listLeaderboard(query: ListLeaderboardQuery) {
    if (query.type === "tasks") {
      return await this.userRepository.findTopByTasks(query.limit || 10)
    }

    return await this.userRepository.findTopByPoints(query.limit || 10)
  }

  async listProfiles(query: ListUserProfilesQuery) {
    if (query.type === "members") {
      return await this.userRepository.findByProfileVisibility("public")
    }

    return await this.userRepository.findByProfileVisibility("public")
  }

  private canDeductHours(roles: string[], projectId?: number): boolean {
    if (this.identityAccess.hasPermission(roles, "MANAGE_USERS")) {
      return true
    }

    if (this.identityAccess.hasAnyRole(roles, ["GERENTE_PROJETO"]) && projectId) {
      return true
    }

    return false
  }
}

export function createUserManagementGateway() {
  return new UserServiceGateway(
    new UserRepository(),
    createIdentityAccessModule(),
  )
}
