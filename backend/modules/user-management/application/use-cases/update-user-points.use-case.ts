import { NotFoundError, ValidationError, toPublicUser } from "@/backend/domain"
import type { UpdateUserPointsCommand } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * UpdateUserPointsUseCase — points arithmetic rules (OND2-B2, R2).
 * Frozen quirks: "add" floors at 0 via Math.max (even with a negative delta); "remove"/"set"
 * reject negative input; "remove" requires sufficiency.
 */
export class UpdateUserPointsUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(command: UpdateUserPointsCommand) {
    const user = await this.repository.findById(command.userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    if (command.action === "add") {
      user.points = Math.max(0, user.points + command.points)
    } else if (command.action === "remove") {
      if (command.points < 0) throw new ValidationError("Pontos não podem ser negativos")
      if (user.points < command.points) throw new ValidationError("Usuário não possui pontos suficientes")
      user.points -= command.points
    } else {
      if (command.points < 0) throw new ValidationError("Pontos não podem ser negativos")
      user.points = command.points
    }

    return toPublicUser(await this.repository.update(user))
  }
}
