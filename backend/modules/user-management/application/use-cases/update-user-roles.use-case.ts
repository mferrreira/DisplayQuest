import { NotFoundError, requireActorPermission, toPublicUser } from "@/backend/domain"
import type { UpdateUserRolesCommand } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * UpdateUserRolesUseCase — role mutation rules (OND2-B2, R2): add appends only when absent,
 * remove filters, set replaces deduped.
 *
 * B6-4 (D4): MANAGE_USERS PURO (mensagem default). A rota gateava antes da validacao de id/
 * acao/role — ordem preservada com AssertCanManageUsersUseCase antes do parse; aqui recheca.
 */
export class UpdateUserRolesUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(command: UpdateUserRolesCommand) {
    requireActorPermission(command.actor, "MANAGE_USERS")

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
