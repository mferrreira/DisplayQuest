import { toPublicUser } from "@/backend/domain"
import type { ListUserProfilesQuery } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * ListProfilesUseCase — frozen quirk (golden OND2-B1): BOTH query types call
 * findByProfileVisibility("public"), and the repository currently returns ALL users.
 * Changing this is a behaviour decision for the owner, not a clean-arch side effect.
 */
export class ListProfilesUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(query: ListUserProfilesQuery) {
    if (query.type === "members") {
      const members = await this.repository.findByProfileVisibility("public")
      return members.map(toPublicUser)
    }

    const users = await this.repository.findByProfileVisibility("public")
    return users.map(toPublicUser)
  }
}
