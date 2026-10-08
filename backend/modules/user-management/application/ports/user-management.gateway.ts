import type { ActorRef } from "@/backend/domain"
import type {
  CreateUserCommand,
  DeductUserHoursCommand,
  ListLeaderboardQuery,
  ListUserProfilesQuery,
  ListUsersForActorQuery,
  UpdateUserPointsCommand,
  UpdateUserRolesCommand,
  UpdateUserStatusCommand,
} from "@/backend/modules/user-management/application/contracts"

/**
 * B6-4 (D4): os métodos consumidos pelas 8 rotas de usuários passaram a receber o `ActorRef` —
 * a autoridade mora nos use cases (gate puro, self-or-manage, ou assert antes do parse quando a
 * ordem medida coloca o 403 antes de qualquer validação). `deductUserHours`, `listLeaderboard` e
 * `listProfiles` ficam como estavam: suas rotas não têm gate de permissão (medido — fora do D4).
 */
export interface UserManagementGateway {
  createUser(command: CreateUserCommand): Promise<unknown>
  listUsersForActor(query: ListUsersForActorQuery): Promise<unknown[]>
  /**
   * self || MANAGE_USERS. A mensagem é parâmetro porque as duas rotas que leem um usuário
   * congelaram textos diferentes para a MESMA regra: "Acesso negado" (users/[id]) e
   * "Não autorizado" (profile). A decisão é uma; a string é contrato de rota.
   */
  findUserById(actor: ActorRef, userId: number, deniedMessage?: string): Promise<unknown | null>
  /** self || MANAGE_USERS + a trava de campos de quem não gerencia (filterSelfEditableUserFields). */
  updateUser(actor: ActorRef, userId: number, data: Record<string, unknown>): Promise<unknown>
  /** MANAGE_USERS puro (dono nenhum: excluir usuário não é caminho self — DEC-55). */
  deleteUser(actor: ActorRef, userId: number): Promise<void>
  /** MANAGE_USERS puro com a mensagem própria "Acesso negado." (ponto final congelado). */
  listPendingUsers(actor: ActorRef): Promise<unknown>
  moderatePendingUser(actor: ActorRef, userId: number, action: "approve" | "reject"): Promise<unknown>
  /** self || MANAGE_USERS com a mensagem própria "Não autorizado". */
  updateUserProfile(actor: ActorRef, userId: number, data: Record<string, unknown>): Promise<unknown>
  updateUserPoints(command: UpdateUserPointsCommand): Promise<unknown>
  deductUserHours(command: DeductUserHoursCommand): Promise<unknown>
  updateUserRoles(command: UpdateUserRolesCommand): Promise<unknown>
  updateUserStatus(command: UpdateUserStatusCommand): Promise<unknown>
  // B6-3 (D4): leva o ator — o gate de MANAGE_USERS mora no use case.
  listUserStatistics(actor: ActorRef, type?: string | null): Promise<unknown>
  listLeaderboard(query: ListLeaderboardQuery): Promise<unknown>
  listProfiles(query: ListUserProfilesQuery): Promise<unknown>
}
