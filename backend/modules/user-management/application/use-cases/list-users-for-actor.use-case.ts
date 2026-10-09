import { ForbiddenError, resolveUserListVisibility } from "@/backend/domain"
import type { ListUsersForActorQuery } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * ListUsersForActorUseCase — field-level visibility rule (OND2-B2, R2).
 * The policy is the pure domain function `resolveUserListVisibility`; this use case enforces
 * it (frozen denial message) and shapes the rows exactly like the gateway's Prisma `select`
 * did (email for full/managing roles, bio only for full roles).
 *
 * B6-4 (D4): a query passou a levar o `ActorRef` em vez do `actorRoles` cru que a rota
 * entregava — o veredito pré-calculado com outra grafia (mesmo achado do escopo de purchases
 * no B6-2d). A política e a mensagem de negação não mudaram. System actor não tem papéis: cai
 * na negação congelada (medido: nenhuma rotina chama este use case; o bypass do DEC-54 não se
 * aplica a uma regra de VISIBILIDADE de lista, que é sobre papéis).
 */
export class ListUsersForActorUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(query: ListUsersForActorQuery) {
    const visibility = resolveUserListVisibility(
      // `roles` e `unknown` no ActorRef (chega da sessao); `requireApiActor` normaliza antes
      // de a rota construir o ator — mesmo fluxo que `hasPermission` ja consome.
      query.actor.kind === "user" ? (query.actor.roles as readonly string[]) : [],
    )

    if (!visibility.canViewBasicUsers) {
      throw new ForbiddenError("Usuário não tem permissão para visualizar outros usuários")
    }

    const rows = await this.repository.findActiveUsers()

    return rows.map((row) => {
      const out: Record<string, unknown> = {
        id: row.id,
        name: row.name,
        roles: row.roles,
        status: row.status,
        weekHours: row.weekHours,
        points: row.points,
        completedTasks: row.completedTasks,
        avatar: row.avatar,
      }
      if (visibility.canViewFullUsers || visibility.canManageProjectMembers) {
        out.email = row.email
      }
      if (visibility.canViewFullUsers) {
        out.bio = row.bio
      }
      return out
    })
  }
}
