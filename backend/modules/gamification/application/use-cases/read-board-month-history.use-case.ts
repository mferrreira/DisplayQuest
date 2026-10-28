import { ValidationError } from "@/backend/domain/errors"
import { BOARD_TRACKS, type BoardTrack, type MonthCloseRow } from "@/backend/domain/gamification"
import { civilMonthLabel, civilMonthOfInstant } from "@/backend/domain/time"
import type { BoardMonthClosePort } from "@/backend/modules/gamification/application/ports/board-month-close.port"

/**
 * plan-v9 S03 (MODELO R9, R12, §7, CA4, CA8) — ler o quadro de um mês.
 *
 * O contrato que importa aqui é o que a tela não pode decidir sozinha:
 *  - mês fechado devolve valor e posição congelados, e diz que está fechado (CA4). Nada é
 *    reordenado na leitura: `position` é o que o fechamento escreveu, com o desempate do domínio;
 *  - mês nunca fechado devolve quadro vazio com aviso nomeando o mês pedido, e não o quadro do mês
 *    em curso (CA8). O `?? quadro atual` é o defeito que CA8 existe para pegar;
 *  - mês corrente pedido responde pelo placar vivo (R9): `live: true` e nenhuma linha de histórico.
 *    Quem chama resolve o quadro pela base viva, e o mês nunca é devolvido como "vazio";
 *  - mês com forma inválida é recusado nomeando o campo. Adivinhar mês a partir de texto solto é
 *    a família do erro que a DEC-132 fechou.
 *
 * Não há gate aqui (R12): o quadro é leitura de quem está autenticado, como o quadro vivo é hoje
 * (DEC-136). O ator não decide esta leitura, e por isso ele não entra no comando.
 */

/** O que o mês fechado declara sobre si, na forma que a tela renderiza. */
export interface BoardMonthEntry {
  userId: number
  /** Nome congelado no fechamento (`month_history.userName`), não o nome de hoje. */
  name: string
  /** Pode ser negativo (CA6): o placar do mês é guardado como estava. */
  value: number
  /** 1-based, a posição que o fechamento gravou. */
  position: number
}

export interface BoardMonthHistoryRead {
  month: string
  monthLabel: string
  track: BoardTrack
  /** true quando existe registro de fechamento para este mês e trilha. */
  closed: boolean
  /** true quando o mês pedido é o mês em curso: o quadro se resolve pelo placar vivo (R9). */
  live: boolean
  closedAt: string | null
  entries: BoardMonthEntry[]
  /** Frase que a tela mostra. Nunca vazia: mês vazio também tem o que dizer. */
  notice: string
}

export interface ClosedBoardMonth {
  month: string
  monthLabel: string
}

/** Mês fechado é leitura: valor e posição não se recalculam. Nomeia o mês, para a tela não depender do seletor para isso. */
export function boardMonthClosedNotice(monthLabel: string): string {
  return `Mês fechado: ${monthLabel}. Valor e posição congelados no fechamento.`
}

/** Nomeia o mês e o motivo de ele estar vazio. As duas causas são diferentes e a tela diz qual. */
export function boardMonthEmptyNotice(monthLabel: string, closed: boolean): string {
  return closed
    ? `O quadro de ${monthLabel} está vazio: nenhuma pessoa entrou no fechamento.`
    : `Não existe fechamento de ${monthLabel}. O quadro desse mês está vazio.`
}

/** O mês em curso não é quadro congelado: o aviso diz que o placar é o de agora. */
export function boardMonthLiveNotice(monthLabel: string): string {
  return `Placar de ${monthLabel} em curso. O quadro ainda está aberto.`
}

/** Recusa nomeia o campo e o valor recebido, em vez de devolver o mês corrente. */
function assertCivilMonth(month: string): string {
  const monthLabel = civilMonthLabel(month)
  if (!monthLabel) {
    throw new ValidationError(`month invalido: ${month}`, { details: { month } })
  }
  return monthLabel
}

function toEntry(row: MonthCloseRow): BoardMonthEntry {
  return { userId: row.userId, name: row.userName, value: row.value, position: row.position }
}

export class ReadBoardMonthHistoryUseCase {
  constructor(private readonly monthClose: BoardMonthClosePort) {}

  async execute(month: string, now: Date): Promise<BoardMonthHistoryRead> {
    const monthLabel = assertCivilMonth(month)
    const track = BOARD_TRACKS.MONTH_POINTS

    // R9: o mês corrente pedido não é mês fechado — respondê-lo com quadro vazio seria a mesma
    // mentira de CA8 com o sinal trocado. Nenhuma leitura de histórico acontece neste caminho.
    if (month === civilMonthOfInstant(now)) {
      return {
        month,
        monthLabel,
        track,
        closed: false,
        live: true,
        closedAt: null,
        entries: [],
        notice: boardMonthLiveNotice(monthLabel),
      }
    }

    const closedMonth = await this.monthClose.readClosedMonth(month, track)
    // Ordem declarada aqui também: a porta devolve linhas, e a resposta do quadro é sempre pela
    // posição gravada. Uma fonte desordenada não reordena o mês (CA4).
    const entries = (closedMonth?.rows ?? []).map(toEntry).sort((left, right) => left.position - right.position)

    return {
      month,
      monthLabel,
      track,
      closed: closedMonth !== null,
      live: false,
      closedAt: closedMonth ? closedMonth.closedAt.toISOString() : null,
      entries,
      notice:
        entries.length > 0
          ? boardMonthClosedNotice(monthLabel)
          : boardMonthEmptyNotice(monthLabel, closedMonth !== null),
    }
  }
}

/**
 * Lista os meses que já fecharam, para o seletor da tela saber o que existe abrir.
 *
 * A tela não deduz meses: sem esta lista ela ofereceria meses que não têm fechamento, e a
 * resposta vazia pareceria bug. Do mais recente ao mais antigo.
 */
export class ListClosedBoardMonthsUseCase {
  constructor(private readonly monthClose: BoardMonthClosePort) {}

  async execute(): Promise<ClosedBoardMonth[]> {
    const months = await this.monthClose.listClosedMonths(BOARD_TRACKS.MONTH_POINTS)
    return months.map((month) => ({
      month: month.month,
      // Um mês registrado com rótulo fora da tabela do domínio continua legível pelo valor cru.
      monthLabel: civilMonthLabel(month.month) ?? month.month,
    }))
  }
}
