import { NotFoundError, toPublicUser } from "@/backend/domain"
import type { UpdateUserRolesCommand } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/** UpdateUserRolesUseCase — role mutation rules (OND2-B2, R2): add appends only when absent, remove filters, set replaces deduped. */
export class UpdateUserRolesUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(command: UpdateUserRolesCommand) {
    const user = await this.repository.findById(command.userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    if (command.action === "add") {
      if (command.role && !user.roles.includes(command.role)) {
        user.roles = [...user.roles, command.role]
      }
    } else if (command.action === "remove") {
      user.roles = user.roles.filter((role) => role !== command.role)
    } else {
      user.roles = [...new Set(command.roles || [])]
    }

    return toPublicUser(await this.repository.update(user))
  }
}
