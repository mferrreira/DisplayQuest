import { ValidationError } from "@/backend/domain/errors"
import { BOARD_TRACKS, isSeasonYear, type BoardTrack, type MonthCloseRow } from "@/backend/domain/gamification"
import { civilYearOfInstant } from "@/backend/domain/time"
import type { BoardMonthClosePort } from "@/backend/modules/gamification/application/ports/board-month-close.port"

/**
 * plan-v20 S02 (DEC-252, DEC-255; o contrato de leitura de CA4/CA8 do mês, espelhado) —
 * ler o quadro de uma temporada.
 *
 * O contrato que a tela não pode decidir sozinha, exatamente o do mês:
 *  - temporada fechada devolve valor e posição congelados, e diz que está fechada;
 *  - temporada nunca fechada devolve quadro vazio com aviso nomeando o ano pedido, e nunca o
 *    quadro em curso;
 *  - o ano em curso pedido responde pelo acumulado vivo (`live: true`, nenhuma linha de
 *    histórico) — a tela resolve o quadro pelo saldo da base;
 *  - ano com forma inválida é recusado nomeando o campo.
 *
 * Leitura do autenticado, como o quadro de hoje (DEC-136, R12): nenhum gate.
 */

export interface BoardSeasonEntry {
  userId: number
  /** Nome congelado no fechamento (`month_history.userName`), não o nome de hoje. */
  name: string
  /** Pode ser negativo (DEC-39, DEC-253): o saldo é guardado como estava. */
  value: number
  /** 1-based, a posição que o fechamento gravou. */
  position: number
}

export interface BoardSeasonHistoryRead {
  /** `AAAA` do ano da temporada. */
  year: string
  yearLabel: string
  track: BoardTrack
  closed: boolean
  /** true quando o ano pedido é o ano em curso: o quadro se resolve pelo saldo vivo. */
  live: boolean
  closedAt: string | null
  entries: BoardSeasonEntry[]
  notice: string
}

export interface ClosedSeason {
  year: string
  yearLabel: string
}

/** Rotulo da temporada: o ano, nomeado pelo dominio. Sem `Date`, sem locale (DEC-132). */
export function seasonYearLabel(year: string): string {
  return `temporada ${year}`
}

export function boardSeasonClosedNotice(yearLabel: string): string {
  return `Temporada fechada: ${yearLabel}. Valor e posição congelados no fechamento.`
}

export function boardSeasonEmptyNotice(yearLabel: string, closed: boolean): string {
  return closed
    ? `A temporada ${yearLabel} está vazia: nenhuma pessoa entrou no fechamento.`
    : `Não existe fechamento da temporada ${yearLabel}. O quadro desse ano está vazio.`
}

export function boardSeasonLiveNotice(yearLabel: string): string {
  return `Placar da ${yearLabel} em curso. A temporada ainda está aberta.`
}

function assertSeasonYear(year: string): string {
  if (!isSeasonYear(year)) {
    throw new ValidationError(`year invalido: ${year}`, { details: { year } })
  }
  return seasonYearLabel(year)
}

function toEntry(row: MonthCloseRow): BoardSeasonEntry {
  return { userId: row.userId, name: row.userName, value: row.value, position: row.position }
}

export class ReadSeasonHistoryUseCase {
  constructor(private readonly monthClose: BoardMonthClosePort) {}

  async execute(year: string, now: Date): Promise<BoardSeasonHistoryRead> {
    const yearLabel = assertSeasonYear(year)
    const track = BOARD_TRACKS.SEASON_POINTS

    // O ano em curso pedido não é temporada fechada: respondê-lo com quadro vazio seria a mesma
    // mentira de CA8 com o sinal trocado (R9 do mês, espelhada).
    if (year === civilYearOfInstant(now)) {
      return {
        year,
        yearLabel,
        track,
        closed: false,
        live: true,
        closedAt: null,
        entries: [],
        notice: boardSeasonLiveNotice(yearLabel),
      }
    }

    const closedSeason = await this.monthClose.readClosedMonth(year, track)
    // Ordem declarada aqui também: a porta devolve linhas, e a resposta do quadro é sempre pela
    // posição gravada (CA4).
    const entries = (closedSeason?.rows ?? [])
      .map(toEntry)
      .sort((left, right) => left.position - right.position)

    return {
      year,
      yearLabel,
      track,
      closed: closedSeason !== null,
      live: false,
      closedAt: closedSeason ? closedSeason.closedAt.toISOString() : null,
      entries,
      notice:
        entries.length > 0
          ? boardSeasonClosedNotice(yearLabel)
          : boardSeasonEmptyNotice(yearLabel, closedSeason !== null),
    }
  }
}

/**
 * Lista as temporadas que já fecharam, para o seletor da tela saber o que existe abrir. A tela
 * não deduz anos (mesma lição da lista de meses). Do mais recente ao mais antigo.
 */
export class ListClosedSeasonsUseCase {
  constructor(private readonly monthClose: BoardMonthClosePort) {}

  async execute(): Promise<ClosedSeason[]> {
    const closed = await this.monthClose.listClosedMonths(BOARD_TRACKS.SEASON_POINTS)
    return closed.map((season) => ({
      year: season.month,
      yearLabel: seasonYearLabel(season.month),
    }))
  }
}
