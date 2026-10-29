import { ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain/errors"
import { requireActorPermission, type ActorRef } from "@/backend/domain/identity"
import {
  monthAdjustDescription,
  monthPointsActionOf,
  nextMonthPoints,
  MONTH_ADJUST_DENIED_MESSAGE,
  type MonthPointsAction,
} from "@/backend/domain/gamification"
import { civilMonthLabel, civilMonthOfInstant } from "@/backend/domain/time"
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port"

/**
 * plan-v9 S05 (MODELO §6, CA12; ADR-006/DEC-228) — ajuste do placar do mês corrente.
 *
 * O que muda e o que NUNCA muda: o placar de um mês fechado é imutável (MODELO §6), e a
 * imutabilidade aqui é estrutural — este use case toca só `users.currentMonthPoints`, a coluna
 * DO mês corrente, e nenhuma linha de `month_history`. Mês fechado não têm coluna para
 * escrever.
 *
 * O trinômio é o do saldo (DEC-60, espelhado por decisão da DEC-228): `set` escreve valor
 * absoluto e aceita negativo, `add` tem chão em 0, `remove` exige suficiência — a aritmética é
 * a regra pura `nextMonthPoints` (backend/domain/gamification/month-adjust-rules), nunca daqui.
 *
 * Cada ajuste vira linha de auditoria (DEC-228): quem, quando (`performedAt`), para quem e
 * de→para — escrita do adaptador, mesma transação da coluna. Ação própria
 * GAMIFICATION_MONTH_ADJUST: a dedupe da premiação consulta (action, description, entityId) e
 * uma linha de ajuste não pode zerar prêmio futuro.
 *
 * O gate é MANAGE_USERS com mensagem própria, e o recorte de mês é derivado de `now` (DEC-132:
 * nenhuma regra chama `new Date()` sozinha; o instante entra por parâmetro).
 */
export interface AdjustMonthPointsCommand {
  actor: ActorRef
  userId: number
  action: MonthPointsAction
  points: number
  now: Date
}

export interface MonthPointsAdjustResult {
  userId: number
  month: string
  monthLabel: string
  action: MonthPointsAction
  /** O de→para mudam exatamente como gravado na auditoria — a tela não recalcula (R7). */
  previous: number
  current: number
}

export class AdjustMonthPointsUseCase {
  constructor(private readonly users: GamificationUsersPort) {}

  async execute(command: AdjustMonthPointsCommand): Promise<MonthPointsAdjustResult> {
    requireActorPermission(command.actor, "MANAGE_USERS", MONTH_ADJUST_DENIED_MESSAGE)

    // `requireActorPermission` deixa ator de sistema passar (o bypass declarado do cron), mas o
    // ajuste não tem chamador de sistema — é ação de gestão, com a auditoria apontando uma
    // pessoa (DEC-228). Matar o ramo aqui: nenhum `performedBy` fantasma nunca entra no banco.
    const actor = command.actor
    if (actor.kind !== "user") {
      throw new ForbiddenError("O ajuste do placar do mês precisa de uma pessoa responsável.")
    }

    if (!Number.isInteger(command.userId) || command.userId <= 0) {
      throw new ValidationError(`userId invalido: ${String(command.userId)}`, {
        details: { userId: String(command.userId) },
      })
    }
    const action = monthPointsActionOf(command.action)

    const month = civilMonthOfInstant(command.now)
    const monthLabel = civilMonthLabel(month)
    if (!monthLabel) {
      throw new ValidationError(`mes civil invalido: ${month}`)
    }

    const person = await this.users.findMonthPointsById(command.userId)
    if (!person) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const current = nextMonthPoints({ action, points: command.points, current: person.currentMonthPoints })

    await this.users.adjustMonthPoints({
      userId: command.userId,
      previous: person.currentMonthPoints,
      next: current,
      month,
      performedBy: actor.id,
      description: monthAdjustDescription(month),
      detail: { action, points: command.points, month },
    })

    return {
      userId: command.userId,
      month,
      monthLabel,
      action,
      previous: person.currentMonthPoints,
      current,
    }
  }
}
