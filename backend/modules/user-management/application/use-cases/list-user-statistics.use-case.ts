import { requireActorPermission } from "@/backend/domain/identity"
import type { ActorRef } from "@/backend/domain"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * ListUserStatisticsUseCase — dispatch frozen by the golden (roles/status/general/default).
 *
 * B6-3 (D4): MANAGE_USERS puro (default "Acesso negado") — a rota
 * GET /api/users/statistics decidia com `ensurePermission`. Medido: chamador unico e a rota.
 */
export class ListUserStatisticsUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(actor: ActorRef, type?: string | null) {
    requireActorPermission(actor, "MANAGE_USERS")

    switch (type) {
      case "roles":
        return await this.repository.getUsersByRole()
      case "status":
        return await this.repository.getUsersByStatus()
      case "general":
      default:
        return await this.repository.getUserStatistics()
    }
  }
}
