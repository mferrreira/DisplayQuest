import { ForbiddenError, resolveUserListVisibility } from "@/backend/domain"
import type { ListUsersForActorQuery } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * ListUsersForActorUseCase — field-level visibility rule (OND2-B2, R2).
 * The policy is the pure domain function `resolveUserListVisibility`; this use case enforces
 * it (frozen denial message) and shapes the rows exactly like the gateway's Prisma `select`
 * did (email for full/managing roles, bio only for full roles).
 */
export class ListUsersForActorUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(query: ListUsersForActorQuery) {
    const visibility = resolveUserListVisibility(query.actorRoles)

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
