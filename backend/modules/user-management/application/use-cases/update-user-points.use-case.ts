import { NotFoundError, requireActorPermission, ValidationError, toPublicUser } from "@/backend/domain"
import type { UpdateUserPointsCommand } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * UpdateUserPointsUseCase — points arithmetic rules (OND2-B2, R2).
 * Frozen quirks: "add" floors at 0 via Math.max (even with a negative delta); "remove" rejects
 * negative input and requires sufficiency. Changed in V4-6 (DEC-60): "set" no longer rejects
 * negative input — the award path produces negative totals (DEC-39, penalty without floor) and
 * administration had no way to write one back.
 *
 * B6-4 (D4): MANAGE_USERS PURO (mensagem default). A rota gateava ANTES da validacao de id/
 * corpo/acao — ordem preservada com AssertCanManageUsersUseCase antes do parse; aqui o gate
 * recheca e protege chamadores futuros. As validacoes DEC-60/DEC-84 (acao antes do numero,
 * leitura do valor bruto) continuam na rota: sao validacao de entrada com corpo proprio.
 */
export class UpdateUserPointsUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(command: UpdateUserPointsCommand) {
    requireActorPermission(command.actor, "MANAGE_USERS")

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
      // DEC-60 (dono, 2026-10-05): `set` é valor absoluto e aceita negativo, porque a premiação
      // produz total negativo (DEC-39) e a administração precisava conseguir escrevê-lo de volta.
      // Não há checagem de suficiência aqui — não se está tirando nada de ninguém.
      user.points = command.points
    }

    return toPublicUser(await this.repository.update(user))
  }
}
