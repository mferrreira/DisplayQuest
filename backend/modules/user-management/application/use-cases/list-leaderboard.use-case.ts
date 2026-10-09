import { toPublicUser } from "@/backend/domain"
import type { ListLeaderboardQuery } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/** ListLeaderboardUseCase — dispatch + default limit 10 (frozen). */
export class ListLeaderboardUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(query: ListLeaderboardQuery) {
    const limit = query.limit || 10
    const users =
      query.type === "tasks"
        ? await this.repository.findTopByTasks(limit)
        : await this.repository.findTopByPoints(limit)
    return users.map(toPublicUser)
  }
}
