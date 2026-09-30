import { NotFoundError, toPublicUser } from "@/backend/domain"
import type { UpdateUserStatusCommand } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/** UpdateUserStatusUseCase — status transitions frozen by the golden (unknown action -> active). */
export class UpdateUserStatusUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(command: UpdateUserStatusCommand) {
    const user = await this.repository.findById(command.userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    if (command.action === "approve") user.status = "active"
    else if (command.action === "reject") user.status = "rejected"
    else if (command.action === "suspend") user.status = "suspended"
    else user.status = "active"

    return toPublicUser(await this.repository.update(user))
  }
}
