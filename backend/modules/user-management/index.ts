import type { ActorRef, PublicUser, UserImageSlot } from "@/backend/domain"
import type { UserManagementGateway } from "@/backend/modules/user-management/application/ports/user-management.gateway"
import type {
  GetUserImageCommand,
  RegisterUserCommand,
  UpdateUserImageCommand,
} from "@/backend/modules/user-management/application/contracts"
import type { PasswordHasher } from "@/backend/modules/user-management/application/ports/password-hasher"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"
import type { ProfileVisibilityPort } from "@/backend/modules/user-management/application/ports/profile-visibility.port"
import { CreateUserUseCase } from "@/backend/modules/user-management/application/use-cases/create-user.use-case"
import { AssertCanManageUsersUseCase } from "@/backend/modules/user-management/application/use-cases/assert-can-manage-users.use-case"
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
import { UpdateUserImageUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-image.use-case"
import { GetUserImageUseCase } from "@/backend/modules/user-management/application/use-cases/get-user-image.use-case"
import { AssertCanUpdateUserImageUseCase } from "@/backend/modules/user-management/application/use-cases/assert-can-update-user-image.use-case"
import type { AssertCanUpdateUserImageCommand } from "@/backend/modules/user-management/application/use-cases/assert-can-update-user-image.use-case"
import { UpdateUserRolesUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-roles.use-case"
import { UpdateUserStatusUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-status.use-case"
import { createBcryptPasswordHasher } from "@/backend/modules/user-management/infrastructure/bcrypt-password-hasher"
import { createPrismaUserRepository } from "@/backend/modules/user-management/infrastructure/repositories/prisma-user.repository"
import { createPrismaProfileVisibility } from "@/backend/modules/user-management/infrastructure/repositories/prisma-profile-visibility"

type GatewayCall<T> = T extends (...args: infer A) => infer R ? (...args: A) => R : never

/**
 * The public self-registration capability (OND2-B3). NOT part of `UserManagementGateway`:
 * the legacy gateway never had it (register lived in the route). The module exposes it on
 * the new wiring (the legacy gateway/seam was removed in OND9-B1, repo-cleanup B8).
 */
export interface RegisterUserCapability {
  registerUser(command: RegisterUserCommand): Promise<unknown>
}

/**
 * Capacidades de imagem de perfil (V5-3, DEC-137). Também NÃO fazem parte de `UserManagementGateway`:
 * o gateway legado nunca teve imagem de usuário — o avatar vive no caminho legado de disco.
 */
export interface UserImageCapability {
  updateUserImage(command: UpdateUserImageCommand): Promise<{ user: PublicUser; previousKey: string | null }>
  getUserImage(command: GetUserImageCommand): Promise<{ slot: UserImageSlot; blobKey: string }>
}

/** The module's public surface: the same 15 methods the routes consume today + registerUser. */
export type UserManagementService = UserManagementGateway & RegisterUserCapability & UserImageCapability

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
  readonly updateUserImage: GatewayCall<UserImageCapability["updateUserImage"]>
  readonly getUserImage: GatewayCall<UserImageCapability["getUserImage"]>
  /** B6-4 (D4): assert 403-antes-do-parse/validação; os use cases de destino rechecam. */
  readonly assertCanManageUsers: (command: { actor: ActorRef; deniedMessage?: string }) => void
  /** V5-3 (DEC-137): assert 403-ANTES-DO-CORPO do upload; `updateUserImage` recheca no próprio ator. */
  readonly assertCanUpdateUserImage: (command: AssertCanUpdateUserImageCommand) => void

  constructor(
    private readonly service: UserManagementService,
    assertCanManageUsersUseCase: AssertCanManageUsersUseCase,
    assertCanUpdateUserImageUseCase: AssertCanUpdateUserImageUseCase,
  ) {
    this.assertCanManageUsers = (command) => assertCanManageUsersUseCase.execute(command)
    this.assertCanUpdateUserImage = (command) => assertCanUpdateUserImageUseCase.execute(command)
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
    this.updateUserImage = this.service.updateUserImage.bind(this.service)
    this.getUserImage = this.service.getUserImage.bind(this.service)
  }
}

export interface UserManagementModuleFactoryOptions {
  /** Primary seam (OND2-B2, DEC-17): inject a fake `UserRepositoryPort` in tests. */
  repository?: UserRepositoryPort
  /** Secondary seam: fake hasher (tests avoid real bcrypt). */
  passwordHasher?: PasswordHasher
  /** V5-12 (DEC-143/177): vínculo em comum para a regra de visibilidade de perfil. */
  profileVisibility?: ProfileVisibilityPort
}

export function createUserManagementModule(options: UserManagementModuleFactoryOptions = {}) {
  const repository = options.repository ?? createPrismaUserRepository()
  const passwordHasher = options.passwordHasher ?? createBcryptPasswordHasher()
  const profileVisibility = options.profileVisibility ?? createPrismaProfileVisibility()

  const deleteUserUseCase = new DeleteUserUseCase(repository)
  const service: UserManagementService = {
    createUser: (command) => new CreateUserUseCase(repository, passwordHasher).execute(command),
    listUsersForActor: (query) => new ListUsersForActorUseCase(repository, profileVisibility).execute(query),
    findUserById: (actor, userId, deniedMessage) =>
      new FindUserByIdUseCase(repository, profileVisibility).execute(actor, userId, deniedMessage),
    updateUser: (actor, userId, data) => new UpdateUserUseCase(repository).execute(actor, userId, data),
    deleteUser: (actor, userId) => deleteUserUseCase.execute(actor, userId),
    listPendingUsers: (actor) => new ListPendingUsersUseCase(repository).execute(actor),
    moderatePendingUser: (actor, userId, action) =>
      new ModeratePendingUserUseCase(repository, deleteUserUseCase).execute(actor, userId, action),
    updateUserProfile: (actor, userId, data) =>
      new UpdateUserProfileUseCase(repository, passwordHasher).execute(actor, userId, data),
    updateUserPoints: (command) => new UpdateUserPointsUseCase(repository).execute(command),
    deductUserHours: (command) => new DeductUserHoursUseCase(repository).execute(command),
    updateUserRoles: (command) => new UpdateUserRolesUseCase(repository).execute(command),
    updateUserStatus: (command) => new UpdateUserStatusUseCase(repository).execute(command),
    listUserStatistics: (actor, type) => new ListUserStatisticsUseCase(repository).execute(actor, type),
    listLeaderboard: (query) => new ListLeaderboardUseCase(repository).execute(query),
    listProfiles: (query) => new ListProfilesUseCase(repository, profileVisibility).execute(query),
    registerUser: (command) => new RegisterUserUseCase(repository, passwordHasher).execute(command),
    updateUserImage: (command) => new UpdateUserImageUseCase(repository).execute(command),
    getUserImage: (command) => new GetUserImageUseCase(repository).execute(command),
  }

  return new UserManagementModule(
    service,
    new AssertCanManageUsersUseCase(),
    new AssertCanUpdateUserImageUseCase(),
  )
}
