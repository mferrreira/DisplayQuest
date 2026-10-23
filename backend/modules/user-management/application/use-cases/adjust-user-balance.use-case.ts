import { NotFoundError, requireActorPermission, toPublicUserWithCoins } from "@/backend/domain";
import type { AdjustUserBalanceCommand } from "@/backend/modules/user-management/application/contracts";
import type { TrackAdjustmentLedgerPort } from "@/backend/modules/user-management/application/ports/track-adjustment-ledger.port";
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository";

/**
 * AdjustUserBalanceUseCase — o ajuste manual do painel sobre as DUAS trilhas de saldo (plan-v8
 * V8-5, DEC-215 + ASK-V8-24). Antes era `UpdateUserPointsUseCase`: a aritmética de pontos
 * (OND2-B2, R2) com os quirks congelados — `add` com chão 0 em `Math.max` mesmo com delta
 * negativo, `remove` recusando negativo e exigindo suficiência, e `set` aceitando negativo desde o
 * V4-6 (DEC-60: a premiação produz total negativo, DEC-39, e a administração precisava escrevê-lo
 * de volta).
 *
 * O que mudou na V8-5:
 *   - a trilha entra no comando e é OBRIGATÓRIA (pontos do mês ou moeda), e a aritmética é a regra
 *     pura do domínio (`applyTrackAdjustment`), aplicada dentro do $transaction do ledger — o
 *     saldo e a linha de auditoria acontecem juntos, como no award;
 *   - cada ajuste grava linha de `history` (action TRACK_ADJUSTMENT, trilha na coluna `track`,
 *     saldos antes e depois), que é a resposta de ASK-V8-24;
 *   - chão de moeda: na trilha moeda não existe saldo negativo (nenhuma fonte produz negativo —
 *     DEC-215/74) e `set` é recusado abaixo de zero (DEC-222). Na trilha pontos DEC-60 continua.
 *
 * B6-4 (D4): MANAGE_USERS PURO (mensagem default). A rota gateava ANTES da validação de id/
 * corpo/ação — ordem preservada com AssertCanManageUsersUseCase antes do parse; aqui o gate
 * recheca e protege chamadores futuros. As validações DEC-60/DEC-84 (ação antes do número, leitura
 * do valor bruto) continuam na rota: são validação de entrada com corpo próprio.
 */
export class AdjustUserBalanceUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly ledger: TrackAdjustmentLedgerPort,
  ) {}

  async execute(command: AdjustUserBalanceCommand) {
    requireActorPermission(command.actor, "MANAGE_USERS")

    const existing = await this.repository.findById(command.userId)
    if (!existing) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const outcome = await this.ledger.adjust({
      userId: command.userId,
      // Ajuste manual é ação de pessoa: a linha de auditoria é assinada pelo ator (DEC-54 —
      // systemActor não aparece neste caminho, e o guarda de systemActor em rotas garante isso).
      actorId: command.actor.kind === "user" ? command.actor.id : command.userId,
      track: command.track,
      action: command.action,
      amount: command.amount,
    })

    if (!outcome.applied) {
      // O registro sumiu entre a leitura do gate e a transação (delete concorrente). É o mesmo
      // 404 congelado de antes, não um 500.
      throw new NotFoundError("Usuário não encontrado")
    }

    const updated = await this.repository.findById(command.userId)
    if (!updated) {
      throw new NotFoundError("Usuário não encontrado")
    }

    return toPublicUserWithCoins(updated)
  }
}
