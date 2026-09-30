import { toPublicUser } from "@/backend/domain"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/** ListPendingUsersUseCase — moderation queue read (OND2-B2). */
export class ListPendingUsersUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute() {
    const users = await this.repository.findPending()
    return users.map(toPublicUser)
  }
}
