/**
 * backend/domain/gamification/season-close-rules.ts — plan-v20 S01 (DEC-252, DEC-253, DEC-254).
 *
 * O fechamento da temporada em regra pura, no desenho exato do fechamento de mês
 * (`month-close-rules.ts`): nenhum Prisma, nenhum relógio, nenhum `new Date()` dentro da
 * regra — `closedAt` entra pela mão do chamador (DEC-132).
 *
 * A temporada é o conjunto dos 12 quadros de liderança do ano civil (DEC-252, DEC-255):
 *  - o ano que a run fecha é o ano civil que TERMINOU. Às 00:00 de 1 de janeiro de 2027,
 *    depois do fechamento de dezembro, a run fecha a temporada 2026;
 *  - a primeira temporada é 2026. Ano anterior é recusado nomeando o valor;
 *  - o número da linha é `users.points` — o saldo da pessoa no instante do fechamento,
 *    decisão do dono em 2026-11-06 (DEC-253). Negativo congela como está (DEC-39). Não é a
 *    soma dos placares mensais;
 *  - a audiência e o desempate são os MESMOS do fechamento de mês (DEC-226, ADR-004): só
 *    pessoa `active` recebe linha, posição por valor decrescente, nome em ordem de código,
 *    id crescente. Uma só família de régua, dois quadros.
 */
import { ValidationError } from "../errors";
import { UserStatus } from "../identity";
import { endOfCivilMonthInstant, civilMonthOfInstant, startOfCivilMonthInstant } from "../time/civil-day";
import { BOARD_TRACKS, type BoardTrack } from "./board-tracks";

/** A primeira temporada do sistema (DEC-255): o ano civil de 2026. */
export const SEASON_START_YEAR = 2026;

/** Uma pessoa candidata ao fechamento da temporada, na forma mínima que a regra lê. */
export interface SeasonClosePerson {
  id: number;
  name: string;
  status: UserStatus;
  /** O saldo da pessoa no instante da run (`users.points`), não o placar do mês (DEC-253). */
  currentSeasonPoints: number;
}

/** Linha de fechamento da temporada: a mesma forma de `MonthCloseRow`, trilha nomeada. */
export interface SeasonCloseRow {
  userId: number;
  /** Nome de exibição congelado no fechamento (mesma regra do mês, CA6 do plan-v9). */
  userName: string;
  /** Ano civil da temporada ("2026"), não o formato `AAAA-MM` do mês. */
  month: string;
  track: BoardTrack;
  /** Pode ser negativo (DEC-39, DEC-253). */
  value: number;
  /** 1-based, sem buraco. */
  position: number;
  periodStart: Date;
  periodEnd: Date;
  closedAt: Date;
}

export interface SeasonClosePlan {
  rows: SeasonCloseRow[];
  excluded: Array<{ userId: number; status: UserStatus }>;
}

/**
 * O ano que a run fecha: o ano civil TERMINADO, derivado do instante no fuso do laboratório
 * (mesma disciplina da DEC-132 — `civilMonthOfInstant`, nunca `new Date().getFullYear()` solto,
 * que em UTC desloca a virada).
 */
export function closeTargetSeasonYear(now: Date): string {
  const year = Number(civilMonthOfInstant(now).slice(0, 4));
  return String(year - 1);
}

/** O período que a linha de temporada declara: o ano civil inteiro, em instantes de Sao Paulo. */
export function boardSeasonWindow(year: string): { periodStart: Date; periodEnd: Date } {
  return {
    periodStart: startOfCivilMonthInstant(`${year}-01`),
    periodEnd: endOfCivilMonthInstant(`${year}-12`),
  };
}

/** Ano de temporada: quatro dígitos, número, e não anterior à primeira temporada. */
export function isSeasonYear(value: string): boolean {
  return /^20\d{2}$/.test(value) && Number(value) >= SEASON_START_YEAR;
}

/**
 * O desempate da temporada é a MESMA régua do quadro (DEC-253, ADR-004): valor decrescente,
 * nome em ordem de código, id crescente. Exportada para o quadro vivo da aba Temporada (S02)
 * ordenar com a mesma função que o fechamento congelou.
 */
export interface SeasonPositionPerson {
  id: number;
  name: string;
  currentSeasonPoints: number;
}

export function compareBySeasonPosition(a: SeasonPositionPerson, b: SeasonPositionPerson): number {
  if (a.currentSeasonPoints !== b.currentSeasonPoints) {
    return b.currentSeasonPoints - a.currentSeasonPoints;
  }
  if (a.name !== b.name) {
    return a.name < b.name ? -1 : 1;
  }
  return a.id - b.id;
}

/**
 * Monta as linhas do fechamento da temporada a partir das pessoas da base.
 *
 * Ano inválido ou anterior à primeira temporada é recusado nomeando o valor: uma linha de
 * histórico com período errado não é algo que se conserta depois (mesma disciplina de
 * `planMonthClose`).
 */
export function planSeasonClose(input: {
  year: string;
  closedAt: Date;
  people: SeasonClosePerson[];
}): SeasonClosePlan {
  if (!isSeasonYear(input.year)) {
    throw new SeasonYearError(input.year);
  }
  const { periodStart, periodEnd } = boardSeasonWindow(input.year);

  const included: SeasonClosePerson[] = [];
  const excluded: SeasonClosePlan["excluded"] = [];

  for (const person of input.people) {
    if (person.status === UserStatus.ACTIVE) {
      included.push(person);
    } else {
      excluded.push({ userId: person.id, status: person.status });
    }
  }

  const rows = [...included]
    .sort(compareBySeasonPosition)
    .map((person, index) => ({
      userId: person.id,
      userName: person.name,
      month: input.year,
      track: BOARD_TRACKS.SEASON_POINTS,
      value: person.currentSeasonPoints,
      position: index + 1,
      periodStart,
      periodEnd,
      closedAt: input.closedAt,
    }));

  return { rows, excluded };
}

/** Mensagem única para uma temporada já fechada, usada pelo adaptador e pelo HTTP (409). */
export function seasonAlreadyClosedMessage(year: string): string {
  return `A temporada do quadro já foi fechada: ${year}`;
}

/** Ano que não é temporada: recusa nomeando o valor, como `planMonthClose` faz com mês inválido. */
class SeasonYearError extends ValidationError {
  constructor(year: string) {
    super(`ano de temporada invalido: ${year}`, { details: { year } });
  }
}
