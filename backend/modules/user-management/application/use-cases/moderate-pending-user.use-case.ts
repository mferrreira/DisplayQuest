import { NotFoundError, toPublicUser } from "@/backend/domain"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"
import { DeleteUserUseCase } from "./delete-user.use-case"

/**
 * ModeratePendingUserUseCase — approval flow (OND2-B2, R2): approve flips status to active;
 * reject DELETES the user (the current behavior — `deleteUser` semantics, including its
 * NotFound error, preserved by delegating to DeleteUserUseCase).
 */
export class ModeratePendingUserUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly deleteUser: DeleteUserUseCase,
  ) {}

  async execute(userId: number, action: "approve" | "reject") {
    if (action === "approve") {
      const user = await this.repository.findById(userId)
      if (!user) throw new NotFoundError("Usuário não encontrado")
      user.status = "active"
      return toPublicUser(await this.repository.update(user))
    }

    return await this.deleteUser.execute(userId)
  }
}
