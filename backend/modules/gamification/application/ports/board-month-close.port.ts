import type { BoardTrack, MonthClosePerson, MonthCloseRow, SeasonClosePerson } from "@/backend/domain/gamification"

/**
 * BoardMonthClosePort — plan-v9 S02 (MODELO §6, R5, R6; ADR-002, ADR-003), estendida no
 * plan-v20 S01 (DEC-252) para a temporada.
 *
 * O que o fechamento precisa de persistência, na forma mínima que a regra consome: saber se o
 * período já está fechado, ler as pessoas da base, e escrever o fechamento inteiro.
 *
 * `writeClose` e uma chamada só de propósito: registro, linhas das pessoas e os zeros entram no
 * mesmo `$transaction` do adaptador. Separar em `createRows` + `zeroScores` daria ao chamador a
 * opção de fazer metade, e "não existe meio fechamento" é INV3/INV5 do modelo.
 *
 * A temporada (DEC-252) usa as MESMAS funções com `month` sendo o ano civil ("2026") e `track`
 * sendo `SEASON_POINTS`. Zero campo novo de tabela: a coleção foi desenhada para isso (ADR-002).
 */

/** O registro de que um período fechou, na forma que o use case lê para decidir idempotência. */
export interface MonthCloseMarker {
  month: string
  closedAt: Date
}

/**
 * Campos de pontuação que o fechamento zera, por nome. O fechamento de mês zera o placar do mês
 * (`monthPoints`); o fechamento da temporada zera o saldo (`balance`) e o placar do mês — decisão
 * do dono em 2026-11-06 (DEC-253). O zero acontece no mesmo commit das linhas.
 */
export type BoardZeroField = "monthPoints" | "balance"

/** Tudo que uma run de fechamento escreve, numa chamada. */
export interface MonthCloseWrite {
  /** `AAAA-MM` do mês, ou `AAAA` do ano de temporada (DEC-252). */
  month: string
  track: BoardTrack
  periodStart: Date
  periodEnd: Date
  closedAt: Date
  /** `USER:<id>` da rota de gestão ou `SYSTEM:<reason>` do cron. */
  triggeredBy: string
  /** Linhas de histórico, na ordem de posição já decidida pela regra. */
  rows: MonthCloseRow[]
  /** Toda pessoa da base: o zerado alcança quem não recebeu linha (R11). */
  userIdsToZero: number[]
  /** Quais colunas de pontuação vão a zero no mesmo commit. */
  zeroFields: BoardZeroField[]
}

/** A escrita do fechamento da temporada é a MESMA forma, com `month` = ano e trilha nomeada. */
export type SeasonCloseWrite = MonthCloseWrite

export interface BoardMonthClosePort {
  /** Lookup do registro: null quando o período ainda não fechou. Serve mês e temporada. */
  findClosedMonth(month: string, track: BoardTrack): Promise<MonthCloseMarker | null>
  /** Toda pessoa da base, com o placar do mês — a audiência do fechamento mensal. */
  listPeopleForClose(): Promise<MonthClosePerson[]>
  /**
   * plan-v20 S01 (DEC-253): toda pessoa da base com o SALDO (`users.points`) — a audiência do
   * fechamento da temporada. O número da linha é o saldo, não a soma dos placares.
   */
  listPeopleForSeasonClose(): Promise<SeasonClosePerson[]>
  /** Escrita completa do fechamento, num único commit. Serve mês e temporada. */
  writeClose(input: MonthCloseWrite): Promise<void>
  /**
   * plan-v9 S03 (MODELO R12, CA4, CA8): leitura do período fechado.
   *
   * `null` quando o período nunca fechou — quem chama devolve quadro vazio com aviso, e nunca o
   * quadro do período em curso. As linhas vêm como foram gravadas: valor e posição congelados.
   */
  readClosedMonth(month: string, track: BoardTrack): Promise<ClosedMonthRecord | null>
  /** Períodos registrados como fechados numa trilha, do mais recente ao mais antigo (o seletor). */
  listClosedMonths(track: BoardTrack): Promise<ClosedMonthListing[]>
  /**
   * plan-v9 S04 (MODELO §7, DEC-232): os meses fechados de UMA pessoa, do mais recente ao mais
   * antigo. É a mesma tabela do `readClosedMonth` filtrada por pessoa — a leitura é a do
   * autenticado (R12), e nenhum dado novo aparece por aqui que o quadro por mês não mostre.
   */
  listClosedMonthsForUser(userId: number, track: BoardTrack): Promise<MonthCloseRow[]>
}

/** O mês fechado lido, com as linhas na ordem de posição. */
export interface ClosedMonthRecord {
  closedAt: Date
  peopleCount: number
  triggeredBy: string
  rows: MonthCloseRow[]
}

/** O essencial de um mês fechado para quem precisa listar meses. */
export interface ClosedMonthListing {
  month: string
  closedAt: Date
  peopleCount: number
}
