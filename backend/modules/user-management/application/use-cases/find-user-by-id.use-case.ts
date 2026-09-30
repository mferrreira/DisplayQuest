import { toPublicUser } from "@/backend/domain"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/** FindUserByIdUseCase — read use case (OND2-B2). Returns the public shape (no password), same as the model's toJSON today. */
export class FindUserByIdUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(userId: number) {
    const user = await this.repository.findById(userId)
    return user ? toPublicUser(user) : null
  }
}
