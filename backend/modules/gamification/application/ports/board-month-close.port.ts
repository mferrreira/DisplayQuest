import type { BoardTrack, MonthClosePerson, MonthCloseRow } from "@/backend/domain/gamification"

/**
 * BoardMonthClosePort — plan-v9 S02 (MODELO §6, R5, R6; ADR-002, ADR-003).
 *
 * O que o fechamento de mês precisa de persistência, na forma mínima que a regra consome:
 * saber se o mês já está fechado, ler as pessoas da base, e escrever o fechamento inteiro.
 *
 * `writeClose` e uma chamada só de propósito: registro do mês, linhas das pessoas e zerado do
 * placar entram no mesmo `$transaction` do adaptador. Separar em `createRows` + `zeroScores`
 * daria ao chamador a opção de fazer metade, e "não existe meio mês fechado" é INV5 do modelo.
 */

/** O registro de que um mês fechou, na forma que o use case lê para decidir idempotência. */
export interface MonthCloseMarker {
  month: string
  closedAt: Date
}

/** Tudo que uma run de fechamento escreve, numa chamada. */
export interface MonthCloseWrite {
  month: string
  track: BoardTrack
  periodStart: Date
  periodEnd: Date
  closedAt: Date
  /** `USER:<id>` da rota de gestão ou `SYSTEM:<reason>` do cron. */
  triggeredBy: string
  /** Linhas de histórico, na ordem de posição já decidida pela regra. */
  rows: MonthCloseRow[]
  /** Toda pessoa da base: o placar do mês é zerado também para quem não recebeu linha (R11). */
  userIdsToZero: number[]
}

export interface BoardMonthClosePort {
  /** Lookup do registro de mês: null quando o mês ainda não fechou. */
  findClosedMonth(month: string, track: BoardTrack): Promise<MonthCloseMarker | null>
  /** Toda pessoa da base, com status reconciliado pelo vocabulário do domínio. */
  listPeopleForClose(): Promise<MonthClosePerson[]>
  /** Escrita completa do fechamento, num único commit. */
  writeClose(input: MonthCloseWrite): Promise<void>
}
