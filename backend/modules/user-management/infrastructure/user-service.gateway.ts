import { UserService } from "@/backend/services/UserService"
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
import { hasRole } from "@/lib/auth/rbac"
import { prisma } from "@/lib/database/prisma"

export class UserServiceGateway implements UserManagementGateway {
  constructor(private readonly userService: UserService) {}

  async listUsersForActor(query: ListUsersForActorQuery): Promise<unknown[]> {
    const canViewFullUsers = hasRole(query.actorRoles, ["COORDENADOR", "GERENTE"])
    const canViewBasicUsers = hasRole(query.actorRoles, [
      "COORDENADOR",
      "GERENTE",
      "VOLUNTARIO",
      "COLABORADOR",
      "LABORATORISTA",
    ])

    if (!canViewBasicUsers) {
      throw new Error("Usuário não tem permissão para visualizar outros usuários")
    }

    return await prisma.users.findMany({
      where: {
        status: "active",
      },
      select: {
        id: true,
        name: true,
        email: canViewFullUsers,
        roles: true,
        status: canViewFullUsers,
        weekHours: true,
        points: true,
        completedTasks: true,
        avatar: true,
        bio: canViewFullUsers,
      },
      orderBy: {
        name: "asc",
      },
    })
  }

  async findUserById(userId: number) {
    return await this.userService.findById(userId)
  }

  async updateUser(userId: number, data: Record<string, unknown>) {
    return await this.userService.update(userId, data)
  }

  async deleteUser(userId: number) {
    await this.userService.delete(userId)
  }

  async listPendingUsers() {
    return await this.userService.findPending()
  }

  async moderatePendingUser(userId: number, action: "approve" | "reject") {
    if (action === "approve") {
      return await this.userService.approveUser(userId)
    }

    return await this.userService.delete(userId)
  }

  async updateUserProfile(userId: number, data: Record<string, unknown>) {
    return await this.userService.updateProfile(userId, data)
  }

  async updateUserPoints(command: UpdateUserPointsCommand) {
    if (command.action === "add") {
      return await this.userService.addPoints(command.userId, command.points)
    }
    if (command.action === "remove") {
      return await this.userService.removePoints(command.userId, command.points)
    }

    return await this.userService.setPoints(command.userId, command.points)
  }

  async deductUserHours(command: DeductUserHoursCommand) {
    return await this.userService.deductHours(command.userId, {
      hours: command.hours,
      reason: command.reason,
      projectId: command.projectId,
      deductedBy: command.deductedBy,
      deductedByRoles: command.deductedByRoles,
    })
  }

  async updateUserRoles(command: UpdateUserRolesCommand) {
    if (command.action === "add") {
      return await this.userService.addRole(command.userId, command.role!)
    }
    if (command.action === "remove") {
      return await this.userService.removeRole(command.userId, command.role!)
    }

    return await this.userService.setRoles(command.userId, command.roles || [])
  }

  async updateUserStatus(command: UpdateUserStatusCommand) {
    if (command.action === "approve") {
      return await this.userService.approveUser(command.userId)
    }
    if (command.action === "reject") {
      return await this.userService.rejectUser(command.userId)
    }
    if (command.action === "suspend") {
      return await this.userService.suspendUser(command.userId)
    }

    return await this.userService.activateUser(command.userId)
  }

  async listUserStatistics(type?: string | null) {
    switch (type) {
      case "roles":
        return await this.userService.getUsersByRole()
      case "status":
        return await this.userService.getUserByStatus()
      case "general":
      default:
        return await this.userService.getUserStatistics()
    }
  }

  async listLeaderboard(query: ListLeaderboardQuery) {
    if (query.type === "tasks") {
      return await this.userService.getTopUsersByTasks(query.limit)
    }

    return await this.userService.getTopUsersByPoints(query.limit)
  }

  async listProfiles(query: ListUserProfilesQuery) {
    if (query.type === "members") {
      return await this.userService.getMemberProfiles()
    }

    return await this.userService.getPublicProfiles()
  }
}

export function createUserManagementGateway() {
  return new UserServiceGateway(
    new UserService(new UserRepository()),
  )
}
