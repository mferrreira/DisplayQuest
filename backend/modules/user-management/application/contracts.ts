import type { ActorRef, UserRole } from "@/backend/domain"

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

export interface UpdateUserPointsCommand {
  /** B6-4 (D4): gate MANAGE_USERS puro no use case (rota preserva a ordem gate-antes-de-400 com assert). */
  actor: ActorRef
  userId: number
  action: "add" | "remove" | "set"
  points: number
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
