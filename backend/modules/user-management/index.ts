import type { UserManagementGateway } from "@/backend/modules/user-management/application/ports/user-management.gateway"
import {
  createUserManagementGateway,
  type UserManagementGatewayDependencies,
} from "@/backend/modules/user-management/infrastructure/user-service.gateway"
import { createIdentityAccessModule } from "@/backend/modules/identity-access"

type GatewayCall<T> = T extends (...args: infer A) => infer R ? (...args: A) => R : never

export class UserManagementModule {
  readonly listUsersForActor: GatewayCall<UserManagementGateway["listUsersForActor"]>
  readonly findUserById: GatewayCall<UserManagementGateway["findUserById"]>
  readonly updateUser: GatewayCall<UserManagementGateway["updateUser"]>
  readonly deleteUser: GatewayCall<UserManagementGateway["deleteUser"]>
  readonly listPendingUsers: GatewayCall<UserManagementGateway["listPendingUsers"]>
  readonly moderatePendingUser: GatewayCall<UserManagementGateway["moderatePendingUser"]>
  readonly updateUserProfile: GatewayCall<UserManagementGateway["updateUserProfile"]>
  readonly updateUserPoints: GatewayCall<UserManagementGateway["updateUserPoints"]>
  readonly deductUserHours: GatewayCall<UserManagementGateway["deductUserHours"]>
  readonly updateUserRoles: GatewayCall<UserManagementGateway["updateUserRoles"]>
  readonly updateUserStatus: GatewayCall<UserManagementGateway["updateUserStatus"]>
  readonly listUserStatistics: GatewayCall<UserManagementGateway["listUserStatistics"]>
  readonly listLeaderboard: GatewayCall<UserManagementGateway["listLeaderboard"]>
  readonly listProfiles: GatewayCall<UserManagementGateway["listProfiles"]>

  constructor(private readonly gateway: UserManagementGateway) {
    this.listUsersForActor = this.gateway.listUsersForActor.bind(this.gateway)
    this.findUserById = this.gateway.findUserById.bind(this.gateway)
    this.updateUser = this.gateway.updateUser.bind(this.gateway)
    this.deleteUser = this.gateway.deleteUser.bind(this.gateway)
    this.listPendingUsers = this.gateway.listPendingUsers.bind(this.gateway)
    this.moderatePendingUser = this.gateway.moderatePendingUser.bind(this.gateway)
    this.updateUserProfile = this.gateway.updateUserProfile.bind(this.gateway)
    this.updateUserPoints = this.gateway.updateUserPoints.bind(this.gateway)
    this.deductUserHours = this.gateway.deductUserHours.bind(this.gateway)
    this.updateUserRoles = this.gateway.updateUserRoles.bind(this.gateway)
    this.updateUserStatus = this.gateway.updateUserStatus.bind(this.gateway)
    this.listUserStatistics = this.gateway.listUserStatistics.bind(this.gateway)
    this.listLeaderboard = this.gateway.listLeaderboard.bind(this.gateway)
    this.listProfiles = this.gateway.listProfiles.bind(this.gateway)
  }
}

export interface UserManagementModuleFactoryOptions {
  gateway?: UserManagementGateway
  gatewayDependencies?: Partial<UserManagementGatewayDependencies>
}

export function createUserManagementModule(options: UserManagementModuleFactoryOptions = {}) {
  const gateway = options.gateway ?? createUserManagementGateway({
    identityAccess: createIdentityAccessModule(),
    ...options.gatewayDependencies,
  })

  return new UserManagementModule(gateway)
}
