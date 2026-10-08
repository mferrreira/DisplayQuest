import type { UserManagementGateway } from "@/backend/modules/user-management/application/ports/user-management.gateway"
import type { RegisterUserCommand } from "@/backend/modules/user-management/application/contracts"
import type { PasswordHasher } from "@/backend/modules/user-management/application/ports/password-hasher"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"
import { CreateUserUseCase } from "@/backend/modules/user-management/application/use-cases/create-user.use-case"
import { DeleteUserUseCase } from "@/backend/modules/user-management/application/use-cases/delete-user.use-case"
import { DeductUserHoursUseCase } from "@/backend/modules/user-management/application/use-cases/deduct-user-hours.use-case"
import { FindUserByIdUseCase } from "@/backend/modules/user-management/application/use-cases/find-user-by-id.use-case"
import { ListLeaderboardUseCase } from "@/backend/modules/user-management/application/use-cases/list-leaderboard.use-case"
import { ListPendingUsersUseCase } from "@/backend/modules/user-management/application/use-cases/list-pending-users.use-case"
import { ListProfilesUseCase } from "@/backend/modules/user-management/application/use-cases/list-profiles.use-case"
import { ListUserStatisticsUseCase } from "@/backend/modules/user-management/application/use-cases/list-user-statistics.use-case"
import { ListUsersForActorUseCase } from "@/backend/modules/user-management/application/use-cases/list-users-for-actor.use-case"
import { ModeratePendingUserUseCase } from "@/backend/modules/user-management/application/use-cases/moderate-pending-user.use-case"
import { RegisterUserUseCase } from "@/backend/modules/user-management/application/use-cases/register-user.use-case"
import { UpdateUserUseCase } from "@/backend/modules/user-management/application/use-cases/update-user.use-case"
import { UpdateUserPointsUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-points.use-case"
import { UpdateUserProfileUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-profile.use-case"
import { UpdateUserRolesUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-roles.use-case"
import { UpdateUserStatusUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-status.use-case"
import { createBcryptPasswordHasher } from "@/backend/modules/user-management/infrastructure/bcrypt-password-hasher"
import { createPrismaUserRepository } from "@/backend/modules/user-management/infrastructure/repositories/prisma-user.repository"

type GatewayCall<T> = T extends (...args: infer A) => infer R ? (...args: A) => R : never

/**
 * The public self-registration capability (OND2-B3). NOT part of `UserManagementGateway`:
 * the legacy gateway never had it (register lived in the route). The module exposes it on
 * the new wiring (the legacy gateway/seam was removed in OND9-B1, repo-cleanup B8).
 */
export interface RegisterUserCapability {
  registerUser(command: RegisterUserCommand): Promise<unknown>
}

/** The module's public surface: the same 15 methods the routes consume today + registerUser. */
export type UserManagementService = UserManagementGateway & RegisterUserCapability

export class UserManagementModule {
  readonly createUser: GatewayCall<UserManagementGateway["createUser"]>
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
  readonly registerUser: GatewayCall<RegisterUserCapability["registerUser"]>

  constructor(private readonly service: UserManagementService) {
    this.createUser = this.service.createUser.bind(this.service)
    this.listUsersForActor = this.service.listUsersForActor.bind(this.service)
    this.findUserById = this.service.findUserById.bind(this.service)
    this.updateUser = this.service.updateUser.bind(this.service)
    this.deleteUser = this.service.deleteUser.bind(this.service)
    this.listPendingUsers = this.service.listPendingUsers.bind(this.service)
    this.moderatePendingUser = this.service.moderatePendingUser.bind(this.service)
    this.updateUserProfile = this.service.updateUserProfile.bind(this.service)
    this.updateUserPoints = this.service.updateUserPoints.bind(this.service)
    this.deductUserHours = this.service.deductUserHours.bind(this.service)
    this.updateUserRoles = this.service.updateUserRoles.bind(this.service)
    this.updateUserStatus = this.service.updateUserStatus.bind(this.service)
    this.listUserStatistics = this.service.listUserStatistics.bind(this.service)
    this.listLeaderboard = this.service.listLeaderboard.bind(this.service)
    this.listProfiles = this.service.listProfiles.bind(this.service)
    this.registerUser = this.service.registerUser.bind(this.service)
  }
}

export interface UserManagementModuleFactoryOptions {
  /** Primary seam (OND2-B2, DEC-17): inject a fake `UserRepositoryPort` in tests. */
  repository?: UserRepositoryPort
  /** Secondary seam: fake hasher (tests avoid real bcrypt). */
  passwordHasher?: PasswordHasher
}

export function createUserManagementModule(options: UserManagementModuleFactoryOptions = {}) {
  const repository = options.repository ?? createPrismaUserRepository()
  const passwordHasher = options.passwordHasher ?? createBcryptPasswordHasher()

  const deleteUserUseCase = new DeleteUserUseCase(repository)
  const service: UserManagementService = {
    createUser: (command) => new CreateUserUseCase(repository, passwordHasher).execute(command),
    listUsersForActor: (query) => new ListUsersForActorUseCase(repository).execute(query),
    findUserById: (userId) => new FindUserByIdUseCase(repository).execute(userId),
    updateUser: (userId, data) => new UpdateUserUseCase(repository).execute(userId, data),
    deleteUser: (userId) => deleteUserUseCase.execute(userId),
    listPendingUsers: () => new ListPendingUsersUseCase(repository).execute(),
    moderatePendingUser: (userId, action) =>
      new ModeratePendingUserUseCase(repository, deleteUserUseCase).execute(userId, action),
    updateUserProfile: (userId, data) =>
      new UpdateUserProfileUseCase(repository, passwordHasher).execute(userId, data),
    updateUserPoints: (command) => new UpdateUserPointsUseCase(repository).execute(command),
    deductUserHours: (command) => new DeductUserHoursUseCase(repository).execute(command),
    updateUserRoles: (command) => new UpdateUserRolesUseCase(repository).execute(command),
    updateUserStatus: (command) => new UpdateUserStatusUseCase(repository).execute(command),
    listUserStatistics: (actor, type) => new ListUserStatisticsUseCase(repository).execute(actor, type),
    listLeaderboard: (query) => new ListLeaderboardUseCase(repository).execute(query),
    listProfiles: (query) => new ListProfilesUseCase(repository).execute(query),
    registerUser: (command) => new RegisterUserUseCase(repository, passwordHasher).execute(command),
  }

  return new UserManagementModule(service)
}
