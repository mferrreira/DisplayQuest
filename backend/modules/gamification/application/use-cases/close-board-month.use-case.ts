import { ValidationError } from "@/backend/domain/errors"
import { requireActorPermission, type ActorRef } from "@/backend/domain/identity"
import {
  BOARD_TRACKS,
  boardMonthWindow,
  closeTargetMonth,
  planMonthClose,
  type BoardTrack,
  type MonthClosePerson,
} from "@/backend/domain/gamification"
import { civilMonthLabel } from "@/backend/domain/time"
import type { BoardMonthClosePort } from "@/backend/modules/gamification/application/ports/board-month-close.port"

/** Mensagem congelada do 403. A rota de gestão e o use case dizem a mesma frase. */
export const MONTH_CLOSE_DENIED_MESSAGE = "Apenas coordenadores e gerentes podem fechar o mês do quadro";

export interface CloseBoardMonthCommand {
  actor: ActorRef
  /** Instante da run. Nenhuma regra deste repo chama `new Date()` sozinha (DEC-132). */
  now: Date
}

export interface BoardMonthCloseResult {
  month: string
  monthLabel: string
  track: BoardTrack
  /** Instantes ISO do período fechado, prontos para a tela dizer o que a linha cobre. */
  periodStart: string
  periodEnd: string
  closedAt: string
  /** true quando ESTA run escreveu o fechamento. */
  closed: boolean
  /** true quando o mês já estava fechado e nada mudou (R6, CA2). */
  alreadyClosed: boolean
  /** Linhas escritas. */
  peopleCount: number
  /** Quem ficou fora da linha e por qual status (CA7). */
  excluded: Array<{ userId: number; status: string }>
  /** Auditoria de quem disparou: `USER:<id>` ou `SYSTEM:<reason>`. */
  triggeredBy: string
}

/**
 * CloseBoardMonthUseCase — plan-v9 S02 (MODELO R5, R6, R11; CA1, CA2, CA9).
 *
 * Dois donos, a família do DEC-54: a rota `POST /api/board/close` (gestão, `MANAGE_USERS`) e o
 * cron `0 0 1 * *` de `lib/services/cron-service.ts`, que passa `systemActor("MONTH_CLOSE")`. Sem
 * ator-de-sistema o gate derrubava a rotina, e nenhum teste de rota exercitaria isso.
 *
 * A ordem é o que importa aqui: o gate corre antes de ler gente e antes de qualquer escrita (CA9).
 * Depois vem o mês-alvo (R5), o registro de mês (R6), a regra pura de audiência e posição
 * (DEC-226) e a escrita numa única transação do adaptador (INV5).
 */
export class CloseBoardMonthUseCase {
  constructor(private readonly monthClose: BoardMonthClosePort) {}

  async execute(command: CloseBoardMonthCommand): Promise<BoardMonthCloseResult> {
    requireActorPermission(command.actor, "MANAGE_USERS", MONTH_CLOSE_DENIED_MESSAGE)

    const month = closeTargetMonth(command.now)
    const monthLabel = civilMonthLabel(month)
    if (!monthLabel) {
      throw new ValidationError(`mes civil invalido: ${month}`)
    }
    const { periodStart, periodEnd } = boardMonthWindow(month)
    const track = BOARD_TRACKS.MONTH_POINTS
    const triggeredBy = describeActor(command.actor)

    const existing = await this.monthClose.findClosedMonth(month, track)
    if (existing) {
      return {
        month,
        monthLabel,
        track,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        closedAt: existing.closedAt.toISOString(),
        closed: false,
        alreadyClosed: true,
        peopleCount: 0,
        excluded: [],
        triggeredBy,
      }
    }

    const people: MonthClosePerson[] = await this.monthClose.listPeopleForClose()
    const plan = planMonthClose({ month, closedAt: command.now, people })

    await this.monthClose.writeClose({
      month,
      track,
      periodStart,
      periodEnd,
      closedAt: command.now,
      triggeredBy,
      rows: plan.rows,
      // R11: o placar do mes e zerado de toda pessoa da base, inclusive de quem nao recebeu linha.
      userIdsToZero: people.map((person) => person.id),
    })

    return {
      month,
      monthLabel,
      track,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      closedAt: command.now.toISOString(),
      closed: true,
      alreadyClosed: false,
      peopleCount: plan.rows.length,
      excluded: plan.excluded,
      triggeredBy,
    }
  }
}

function describeActor(actor: ActorRef): string {
  return actor.kind === "system" ? `SYSTEM:${actor.reason}` : `USER:${actor.id}`
}
