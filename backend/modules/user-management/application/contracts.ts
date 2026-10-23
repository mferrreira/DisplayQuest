import type { ActorRef, AwardBalanceTrack, TrackAdjustmentAction, UserImageSlot, UserRole } from "@/backend/domain"

/**
 * B6-4 (D4): o escopo da lista passou a ser decidido a partir do `ActorRef` — o `actorRoles`
 * cru que a rota entregava era o veredito pré-calculado com outra grafia (mesmo achado do
 * `resolvePurchaseQueryScope` no B6-2d). A política (`resolveUserListVisibility`) não mudou.
 */
export interface ListUsersForActorQuery {
  actor: ActorRef
}

export interface DeductUserHoursCommand {
  userId: number
  hours: number
  reason: string
  projectId?: number
  deductedBy: number
  deductedByRoles: string[]
}

/**
 * plan-v8 V8-5 (DEC-215 + ASK-V8-24): o ajuste manual do painel sobre as DUAS trilhas de saldo,
 * separadas — `set`/`add`/`remove` de PONTOS do mês e de MOEDAS, cada ajuste com linha de
 * `history`. Era `UpdateUserPointsCommand` com `points`, e o nome mentia desde que o painel
 * passou a poder ajustar moeda: `track` é obrigatório porque o destino do número é a decisão que
 * o comando carrega, e `amount` é o número informado.
 *
 * B6-4 (D4): gate MANAGE_USERS puro no use case (a rota preserva a ordem gate-antes-de-400 com o assert).
 */
export interface AdjustUserBalanceCommand {
  actor: ActorRef
  userId: number
  track: AwardBalanceTrack
  action: TrackAdjustmentAction
  amount: number
}

export interface UpdateUserRolesCommand {
  actor: ActorRef
  userId: number
  action: "add" | "remove" | "set"
  role?: UserRole
  roles?: UserRole[]
}

export interface UpdateUserStatusCommand {
  actor: ActorRef
  userId: number
  action: "approve" | "reject" | "suspend" | "activate"
}

export interface ListLeaderboardQuery {
  type: "points" | "tasks"
  limit?: number
}

export interface ListUserProfilesQuery {
  type: "public" | "members"
  /** V5-12 (DEC-143/177): a busca de pessoas obedece à visibilidade de perfil — o ator entra na query. */
  actor: ActorRef
}

export interface CreateUserCommand {
  /** B6-4 (D4): gate MANAGE_USERS com a mensagem própria da rota ("Sem permissão para criar usuários"). */
  actor: ActorRef
  name: string
  email: string
  password: string
  roles: string[]
  weekHours: number
}

/** Public self-registration (OND2-B3): no roles/weekHours — the approval flow sets them. */
export interface RegisterUserCommand {
  name: string
  email: string
  password: string
}

/**
 * V5-3 (DEC-137) — imagem de perfil no bucket. `blobKey: null` é o tirar a capa. O `slot` é de
 * lista fechada (`USER_IMAGE_SLOTS`), porque o slot entra na chave do objeto.
 */
export interface UpdateUserImageCommand {
  actor: ActorRef
  userId: number
  slot: UserImageSlot
  blobKey: string | null
}

export interface GetUserImageCommand {
  actor: ActorRef
  userId: number
  slot: UserImageSlot
}
