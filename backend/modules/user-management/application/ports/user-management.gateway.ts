import type {
  DeductUserHoursCommand,
  ListLeaderboardQuery,
  ListUserProfilesQuery,
  ListUsersForActorQuery,
  UpdateUserPointsCommand,
  UpdateUserRolesCommand,
  UpdateUserStatusCommand,
} from "@/backend/modules/user-management/application/contracts"

export interface UserManagementGateway {
  listUsersForActor(query: ListUsersForActorQuery): Promise<unknown[]>
  findUserById(userId: number): Promise<unknown | null>
  updateUser(userId: number, data: Record<string, unknown>): Promise<unknown>
  deleteUser(userId: number): Promise<void>
  listPendingUsers(): Promise<unknown>
  moderatePendingUser(userId: number, action: "approve" | "reject"): Promise<unknown>
  updateUserProfile(userId: number, data: Record<string, unknown>): Promise<unknown>
  updateUserPoints(command: UpdateUserPointsCommand): Promise<unknown>
  deductUserHours(command: DeductUserHoursCommand): Promise<unknown>
  updateUserRoles(command: UpdateUserRolesCommand): Promise<unknown>
  updateUserStatus(command: UpdateUserStatusCommand): Promise<unknown>
  listUserStatistics(type?: string | null): Promise<unknown>
  listLeaderboard(query: ListLeaderboardQuery): Promise<unknown>
  listProfiles(query: ListUserProfilesQuery): Promise<unknown>
}
