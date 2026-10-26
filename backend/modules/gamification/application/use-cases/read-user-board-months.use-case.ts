import { ValidationError } from "@/backend/domain/errors"
import { civilMonthLabel } from "@/backend/domain/time"
import { BOARD_TRACKS, type MonthCloseRow } from "@/backend/domain/gamification"
import type { BoardMonthClosePort } from "@/backend/modules/gamification/application/ports/board-month-close.port"

/**
 * ReadUserBoardMonthsUseCase — plan-v9 S04 (MODELO §7, R12, DEC-232).
 *
 * Os meses fechados de UMA pessoa, do mais recente ao mais antigo: o que o perfil mostra
 * ("placar do mês em curso e a lista dos meses fechados dela").
 *
 * - É a mesma leitura autenticada do histórico por mês (R12): o dado é projeção do quadro por
 *   mês, que qualquer autenticado já lê. Portanto sem gate: ator não entra no comando.
 * - `userId` inválido é recusado nomeando o campo; pessoa sem fechamento devolve lista vazia com
 *   o aviso pronto — vazio é estado com frase, não silêncio.
 */

/** Um mês de uma pessoa: o essencial do histórico para a lista do perfil. */
export interface UserBoardMonthEntry {
  /** `AAAA-MM` do mês fechado. */
  month: string
  /** Rótulo humano vindo da tabela do domínio ("setembro de 2026"). */
  monthLabel: string
  /** Valor fechado — pode ser negativo (R10, CA6). */
  value: number
  /** Posição 1-based gravada no fechamento. */
  position: number
}

export interface UserBoardMonthsRead {
  userId: number
  /** Placar do mês é a trilha de toda lista (ADR-001); trilha futura entra ampliando aqui. */
  track: string
  months: UserBoardMonthEntry[]
  /** Frase do estado vazio (vazia quando a lista tem meses; a tela só a imprime junto do vazio). */
  notice: string
}

/** Nomeia o motivo do vazio; a tela renderiza isso no EmptyState. */
export function userBoardMonthsEmptyNotice(): string {
  return "Nenhum mês fechado ainda. A lista aparece depois do primeiro fechamento."
}

function toEntry(row: MonthCloseRow): UserBoardMonthEntry {
  const monthLabel = civilMonthLabel(row.month)
  if (!monthLabel) {
    // O mês saiu de um fechamento gravado pela regra, e a regra valida forma. Um mês sem rótulo
    // aqui é dado fora do contrato: falha nomeando, em vez de renderizar "mois de " na tela.
    throw new ValidationError(`mes do historico invalido: ${row.month} (pessoa ${row.userId})`, {
      details: { month: row.month, userId: row.userId },
    })
  }
  return {
    month: row.month,
    monthLabel,
    value: row.value,
    position: row.position,
  }
}

export class ReadUserBoardMonthsUseCase {
  constructor(private readonly monthClose: BoardMonthClosePort) {}

  async execute(userId: number): Promise<UserBoardMonthsRead> {
    if (!Number.isInteger(userId) || userId < 1) {
      throw new ValidationError(`userId invalido: ${userId}`, { details: { userId } })
    }

    const rows = await this.monthClose.listClosedMonthsForUser(userId, BOARD_TRACKS.MONTH_POINTS)
    const months = rows
      .map(toEntry)
      // A porta já devolve desc por mês; a ordem é reafirmada aqui porque a leitura da lista é
      // contrato de exibição e não o acaso do orderBy do banco.
      .sort((left, right) => (left.month < right.month ? 1 : left.month > right.month ? -1 : 0))

    return {
      userId,
      track: BOARD_TRACKS.MONTH_POINTS,
      months,
      notice: months.length === 0 ? userBoardMonthsEmptyNotice() : "",
    }
  }
}
