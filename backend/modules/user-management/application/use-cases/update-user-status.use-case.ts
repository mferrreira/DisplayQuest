import { NotFoundError, requireActorPermission, toPublicUser } from "@/backend/domain"
import type { UpdateUserStatusCommand } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * UpdateUserStatusUseCase — status transitions frozen by the golden (unknown action -> active).
 *
 * B6-4 (D4): MANAGE_USERS PURO (mensagem default). A rota gateava antes da validacao de id/
 * acao — ordem preservada com AssertCanManageUsersUseCase antes do parse; aqui recheca.
 * O vocabulario de status escrito e o da DEC-95: active/rejected/suspended.
 */
export class UpdateUserStatusUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(command: UpdateUserStatusCommand) {
    requireActorPermission(command.actor, "MANAGE_USERS")

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
