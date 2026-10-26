/**
 * backend/domain/gamification/month-close-rules.ts — plan-v9 S02 (MODELO R5, R6, R7, R10, R11;
 * CA1, CA6, CA7; ADR-002, ADR-004, DEC-226).
 *
 * O fechamento do mês do Quadro de Liderança em regra pura: qual mês fecha, que período ele
 * declara, quem recebe linha e em que posição. Nenhum Prisma, nenhum relógio, nenhum `new Date()`
 * dentro da regra — `closedAt` entra pela mão do chamador (mesma disciplina da DEC-132).
 *
 * Duas decisões do dono estão escritas aqui, e não no adaptador nem na tela:
 *  - a audiência do fechamento é toda pessoa com `status: active` no instante da run, INCLUSIVE
 *    com placar zero (DEC-226). Quem está em `pending`, `rejected` ou `suspended` não recebe
 *    linha (R11, CA7);
 *  - a posição de uma linha fechada é determinística. O quadro vivo aceita empate porque ele é
 *    recalculado a cada leitura; a linha fechada é lida depois e precisa ser sempre a mesma linha,
 *    então o desempate é valor decrescente, depois nome em ordem de código, depois id crescente.
 *    Ordem de código e não colação local: a posição tem que sair igual em qualquer runtime.
 */
import { UserStatus } from "../identity";
import { endOfCivilMonthInstant, previousCivilMonth, startOfCivilMonthInstant } from "../time/civil-day";
import { BOARD_TRACKS, type BoardTrack } from "./board-tracks";

/** Uma pessoa Candidata ao fechamento, na forma mínima que a regra lê. */
export interface MonthClosePerson {
  id: number;
  name: string;
  status: UserStatus;
  currentMonthPoints: number;
}

/** Linha de fechamento: o estado do quadro no último dia do mês (MODELO §6). */
export interface MonthCloseRow {
  userId: number;
  /** Nome de exibição congelado no fechamento, para o mês continuar legível se a conta mudar. */
  userName: string;
  month: string;
  track: BoardTrack;
  /** Pode ser negativo (CA6, R10). */
  value: number;
  /** 1-based, sem buraco. */
  position: number;
  periodStart: Date;
  periodEnd: Date;
  closedAt: Date;
}

export interface MonthClosePlan {
  /** Linhas a gravar, já na ordem de posição. */
  rows: MonthCloseRow[];
  /** Quem ficou fora da linha, com o status que tirou ela de lá — na ordem em que chegou. */
  excluded: Array<{ userId: number; status: UserStatus }>;
}

/**
 * O mês que a run fecha: o anterior ao instante (R5).
 *
 * Às 00:00 de 1 de novembro o mês civil em curso já é novembro, e o placar vivo ainda carrega
 * outubro. Fechar "o mês atual" zeraria novembro minutos depois de ele começar.
 */
export function closeTargetMonth(now: Date): string {
  return previousCivilMonth(now);
}

/** O período que a linha de fechamento declara, em instantes de America/Sao_Paulo. */
export function boardMonthWindow(month: string): { periodStart: Date; periodEnd: Date } {
  return {
    periodStart: startOfCivilMonthInstant(month),
    periodEnd: endOfCivilMonthInstant(month),
  };
}

/**
 * plan-v9 S04 (ADR-005, DEC-227): a régua de posição sai de privada para exportada. O quadro vivo
 * desempata com a MESMA função do fechado — antes, empate no vivo ficava na ordem de chegada da
 * lista, e vivo e fechado diziam ordens diferentes com o mesmo placar. Uma só função, dois quadros.
 *
 * A forma mínima que a régua lê é `{ id, name, currentMonthPoints }`: o fechado passa
 * `MonthClosePerson` direto (structurally igual), e a tela do quadro projeta o placar opcional
 * como `?? 0` antes de chamar.
 */
export interface BoardPositionPerson {
  id: number;
  name: string;
  currentMonthPoints: number;
}

export function compareByBoardPosition(a: BoardPositionPerson, b: BoardPositionPerson): number {
  if (a.currentMonthPoints !== b.currentMonthPoints) {
    return b.currentMonthPoints - a.currentMonthPoints;
  }
  if (a.name !== b.name) {
    return a.name < b.name ? -1 : 1;
  }
  return a.id - b.id;
}

/**
 * Monta as linhas do fechamento a partir das pessoas da base.
 *
 * `month` inválido nomeia o valor em vez de devolver plano vazio: quem chama decide o que fazer,
 * e uma linha de histórico com período errado não é algo que se conserta depois.
 */
export function planMonthClose(input: {
  month: string;
  closedAt: Date;
  people: MonthClosePerson[];
}): MonthClosePlan {
  const { periodStart, periodEnd } = boardMonthWindow(input.month);
  const included: MonthClosePerson[] = [];
  const excluded: MonthClosePlan["excluded"] = [];

  for (const person of input.people) {
    if (person.status === UserStatus.ACTIVE) {
      included.push(person);
    } else {
      excluded.push({ userId: person.id, status: person.status });
    }
  }

  const rows = [...included]
    .sort(compareByBoardPosition)
    .map((person, index) => ({
      userId: person.id,
      userName: person.name,
      month: input.month,
      track: BOARD_TRACKS.MONTH_POINTS,
      value: person.currentMonthPoints,
      position: index + 1,
      periodStart,
      periodEnd,
      closedAt: input.closedAt,
    }));

  return { rows, excluded };
}

/** Mensagem única para um mês que já está fechado, usada pelo adaptador e pelo HTTP (409). */
export function monthAlreadyClosedMessage(month: string): string {
  return `O mês do quadro já foi fechado: ${month}`;
}
