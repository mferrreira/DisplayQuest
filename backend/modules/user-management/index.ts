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
import { createUserManagementGateway } from "@/backend/modules/user-management/infrastructure/user-service.gateway"

export class UserManagementModule {
  constructor(private readonly gateway: UserManagementGateway) {}

  async listUsersForActor(query: ListUsersForActorQuery) {
    return await this.gateway.listUsersForActor(query)
  }

  async findUserById(userId: number) {
    return await this.gateway.findUserById(userId)
  }

  async updateUser(userId: number, data: Record<string, unknown>) {
    return await this.gateway.updateUser(userId, data)
  }

  async deleteUser(userId: number) {
    await this.gateway.deleteUser(userId)
  }

  async listPendingUsers() {
    return await this.gateway.listPendingUsers()
  }

  async moderatePendingUser(userId: number, action: "approve" | "reject") {
    return await this.gateway.moderatePendingUser(userId, action)
  }

  async updateUserProfile(userId: number, data: Record<string, unknown>) {
    return await this.gateway.updateUserProfile(userId, data)
  }

  async updateUserPoints(command: UpdateUserPointsCommand) {
    return await this.gateway.updateUserPoints(command)
  }

  async deductUserHours(command: DeductUserHoursCommand) {
    return await this.gateway.deductUserHours(command)
  }

  async updateUserRoles(command: UpdateUserRolesCommand) {
    return await this.gateway.updateUserRoles(command)
  }

  async updateUserStatus(command: UpdateUserStatusCommand) {
    return await this.gateway.updateUserStatus(command)
  }

  async listUserStatistics(type?: string | null) {
    return await this.gateway.listUserStatistics(type)
  }

  async listLeaderboard(query: ListLeaderboardQuery) {
    return await this.gateway.listLeaderboard(query)
  }

  async listProfiles(query: ListUserProfilesQuery) {
    return await this.gateway.listProfiles(query)
  }
}

export function createUserManagementModule() {
  return new UserManagementModule(createUserManagementGateway())
}
