import { requireActorPermission, type ActorRef } from "@/backend/domain/identity"
import {
  BOARD_TRACKS,
  boardSeasonWindow,
  closeTargetSeasonYear,
  planSeasonClose,
  type BoardTrack,
  type SeasonClosePerson,
} from "@/backend/domain/gamification"
import type {
  BoardMonthClosePort,
} from "@/backend/modules/gamification/application/ports/board-month-close.port"
import type { EvaluateUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case"

/** Mensagem congelada do 403. A rota de gestão e o use case dizem a mesma frase (DEC-254). */
export const SEASON_CLOSE_DENIED_MESSAGE =
  "Apenas coordenadores e gerentes podem fechar a temporada do quadro";

export interface CloseSeasonCommand {
  actor: ActorRef
  /** Instante da run. Nenhuma regra deste repo chama `new Date()` sozinha (DEC-132). */
  now: Date
}

export interface SeasonCloseResult {
  /** Ano civil da temporada ("2026"), na forma que a linha declara (DEC-252). */
  year: string
  track: BoardTrack
  /** Instantes ISO do período fechado (ano civil inteiro, fuso do laboratório). */
  periodStart: string
  periodEnd: string
  closedAt: string
  /** true quando ESTA run escreveu o fechamento. */
  closed: boolean
  /** true quando a temporada já estava fechada e nada mudou (idempotência, DEC-254). */
  alreadyClosed: boolean
  peopleCount: number
  /** Quem ficou fora da linha e por qual status (audiência do mês, DEC-226). */
  excluded: Array<{ userId: number; status: string }>
  /** Auditoria de quem disparou: `USER:<id>` ou `SYSTEM:SEASON_CLOSE`. */
  triggeredBy: string
}

/**
 * CloseSeasonUseCase — plan-v20 S01 (DEC-252, DEC-253, DEC-254; INV3, INV6).
 *
 * Dois donos, a MESMA família do DEC-54 do fechamento de mês: a rota
 * `POST /api/board/season-close` (gestão, `MANAGE_USERS`) e o cron `0 0 1 * *` de
 * `lib/services/cron-service.ts`, que roda a temporada DEPOIS do fechamento de dezembro e passa
 * `systemActor("SEASON_CLOSE")`. Sem ator de sistema o gate derrubava a rotina.
 *
 * A ordem é o que importa aqui: o gate corre antes de ler gente e antes de qualquer escrita
 * (CA9). Depois vem o ano-alvo (o ano civil TERMINADO, DEC-254), o lookup de idempotência na
 * coleção de fechamento, a regra pura de audiência e posição (DEC-253: o número da linha é o
 * saldo `users.points`), e a escrita num único commit do adaptador — o registro, as linhas e os
 * dois zeros (saldo e placar do mês) entram juntos; "não existe meia temporada fechada" (INV3).
 *
 * O reset de pontos da season é ESTE use case, não uma rotina separada: zerar sem escrever as
 * linhas da temporada apagaria o número que o pódio congela.
 */
export class CloseSeasonUseCase {
  constructor(
    private readonly monthClose: BoardMonthClosePort,
    /** plan-v15 S11 (R4) espelhado: a temporada é episódio de cada pessoa que recebeu linha. */
    private readonly evaluate: EvaluateUserBadgesUseCase,
  ) {}

  async execute(command: CloseSeasonCommand): Promise<SeasonCloseResult> {
    requireActorPermission(command.actor, "MANAGE_USERS", SEASON_CLOSE_DENIED_MESSAGE)

    const year = closeTargetSeasonYear(command.now)
    const { periodStart, periodEnd } = boardSeasonWindow(year)
    const track = BOARD_TRACKS.SEASON_POINTS
    const triggeredBy = describeActor(command.actor)

    const existing = await this.monthClose.findClosedMonth(year, track)
    if (existing) {
      return {
        year,
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

    // plan-v20 S01 (DEC-253): o número da linha é o saldo no instante da run. A base é lida
    // só depois do lookup de idempotência — uma run que não escreve não lê gente.
    const people: SeasonClosePerson[] = await this.monthClose.listPeopleForSeasonClose()
    const plan = planSeasonClose({ year, closedAt: command.now, people })

    await this.monthClose.writeClose({
      month: year,
      track,
      periodStart,
      periodEnd,
      closedAt: command.now,
      triggeredBy,
      rows: plan.rows,
      // DEC-253: os dois zeros, no mesmo commit. O zerado alcança toda a base, inclusive quem
      // não recebeu linha (R11 do mês espelhado).
      userIdsToZero: people.map((person) => person.id),
      zeroFields: ["balance", "monthPoints"],
    })

    // R4 (plan-v15 S11) espelhado: métricas de pontos recomputam do zero da season DEPOIS da
    // escrita, sobre as linhas gravadas (DEC-256).
    for (const row of plan.rows) {
      await this.evaluate.execute(row.userId)
    }

    return {
      year,
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
