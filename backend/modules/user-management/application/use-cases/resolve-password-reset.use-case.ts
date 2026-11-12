import {
  ConflictError,
  NotFoundError,
  requireActorPermission,
  PENDING_MODERATION_DENIED_MESSAGE,
  PASSWORD_RESET_RESOLVED_MESSAGE,
  PASSWORD_RESET_NOT_FOUND_MESSAGE,
  PASSWORD_RESET_USER_NOT_FOUND_MESSAGE,
} from "@/backend/domain";
import type { ActorRef } from "@/backend/domain";
import type { PasswordResetPort } from "@/backend/modules/user-management/application/ports/password-reset.port";
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository";

/**
 * ResolvePasswordResetUseCase — aprovação e rejeição da solicitação (plan-v24 S02,
 * ADR-003/ADR-004, R8/R9/R10, CA4/CA5/CA7, INV3/INV5).
 *
 * Gate `MANAGE_USERS` com a mensagem congelada, rechecado no próprio ator do use case
 * (padrão B6-4: a rota asserta antes do parse, o use case recheca para os chamadores
 * próprios). `now` entra por parâmetro como toda regra de tempo da casa.
 *
 * Ordem medida dos estados (S02 de aceite): gate → linha existe → só pending resolve →
 * usuário existe → escrita. Aprovar com usuário apagado é o 404 da conta com a linha
 * `pending` intacta; nenhuma escrita de conta acontece nesse ramo. Rejeitar nunca toca
 * `users.password` — nem a hash, nem a senha antiga.
 */
export class ResolvePasswordResetUseCase {
  constructor(
    private readonly resets: PasswordResetPort,
    private readonly users: UserRepositoryPort,
  ) {}

  async execute(actor: ActorRef, id: number, action: "approve" | "reject", now: Date) {
    requireActorPermission(actor, "MANAGE_USERS", PENDING_MODERATION_DENIED_MESSAGE);

    const row = await this.resets.findById(id);
    if (!row) throw new NotFoundError(PASSWORD_RESET_NOT_FOUND_MESSAGE);

    if (row.status !== "pending") {
      throw new ConflictError(PASSWORD_RESET_RESOLVED_MESSAGE);
    }

    if (action === "approve") {
      const user = await this.users.findByEmail(row.email);
      if (!user) throw new NotFoundError(PASSWORD_RESET_USER_NOT_FOUND_MESSAGE);

      user.password = row.password;
      await this.users.update(user);
      row.status = "approved";
    } else {
      row.status = "rejected";
    }

    row.resolvedAt = now;
    // `resolvedBy` é a pessoa que resolveu. O ator de sistema não tem id (ActorRef, DEC-115)
    // — se um cron de rotina chamar isto, a linha fica sem resolvedor; hoje só a rota chama,
    // sempre com `userActor`.
    row.resolvedBy = actor.kind === "user" ? actor.id : null;
    const saved = await this.resets.update(row);

    // A hash nunca sai da leitura (CA6): a projeção tira a coluna, como na lista.
    const { password, ...publicRow } = saved;
    return publicRow;
  }
}
