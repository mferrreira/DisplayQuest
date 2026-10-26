/**
 * backend/domain/time — dia civil do laboratório (plan-v3 · batch 1.B).
 *
 * Existe porque a regra de premiação precisa de "que dia de calendário é este instante"
 * e RG-01 proíbe `backend/domain/` de importar `lib/` — onde vive `lib/date-only.ts`
 * (PLAN.md §2, R15). O domínio já resolve isso para janelas de relatório em
 * `backend/domain/reporting/ReportPeriod.ts:41`; aqui é a mesma base, exposta como peça
 * própria porque o backend da premiação e o espelho de exibição do quadro passam a
 * compartilhar exatamente esta aritmética (DEC-31).
 *
 * Pressuposto: America/Sao_Paulo é UTC-3 fixo, sem DST desde 2019. Se o laboratório mudar
 * de fuso, este arquivo é o único lugar onde isso precisa ser dito.
 */

import { ValidationError } from "../errors";

const SP_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Calendar day (`YYYY-MM-DD`) of an instant, as seen in America/Sao_Paulo. */
export function civilDayOfInstant(instant: Date): string {
  const shifted = new Date(instant.getTime() - SP_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * First instant of the civil day of `instant` — 00:00 in America/Sao_Paulo, as a UTC `Date`.
 *
 * É a fronteira usada para dizer "isto é de hoje": a limpeza do feed de atividade (V6-11k)
 * corta por ela e a leitura do feed filtra por ela. As duas pontas leem da MESMA função de
 * propósito — duas contas de "hoje" divergiriam em silêncio na virada do dia.
 */
export function startOfCivilDayInstant(instant: Date): Date {
  const [year, month, day] = civilDayOfInstant(instant).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + SP_OFFSET_MS);
}

/**
 * Calendar day of a stored date. `tasks.dueDate` is a plain `String?` and the board form
 * submits bare `YYYY-MM-DD` (`features/tasks/components/task-dialog.tsx:200`,
 * `<Input type="date">`), while legacy rows and instants arrive as full ISO. Both mean the
 * same calendar day here — which is precisely what the pre-v3 arithmetic got wrong.
 *
 * Returns `null` for an unparseable value: the caller decides whether that means "no deadline".
 */
export function civilDayOfDate(value: string): string | null {
  if (DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));
    const real =
      check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
    return real ? value : null;
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return civilDayOfInstant(instant);
}

/** Whole calendar days from `from` to `to` (positive when `to` is a later day). */
export function civilDaysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/**
 * Civil month (`YYYY-MM`) of an instant, as seen in America/Sao_Paulo. plan-v9 (R4, DEC-224).
 *
 * Mes do quadro e fechamento de mes saem daqui, nunca de `getMonth()` do navegador:
 * `new Date("2026-10")` e meia-noite UTC e viraria setembro no rotulo (mesma medição do V5-2b).
 */
export function civilMonthOfInstant(instant: Date): string {
  const day = civilDayOfInstant(instant);
  return day.slice(0, 7);
}

/** Civil month of the month that closed immediately before `instant` — "2026-09" para uma run em outubro. */
export function previousCivilMonth(instant: Date): string {
  const [year, month] = civilMonthOfInstant(instant).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 2, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

function civilMonthParts(month: string): [number, number] {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new ValidationError(`mes civil invalido: ${month}`);
  }
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new ValidationError(`mes civil invalido: ${month}`);
  }
  return [year, monthNumber];
}

/**
 * First instant of a civil month — 00:00 do dia 1 em America/Sao_Paulo, como `Date` UTC.
 * plan-v9 S02 (R5, MODELO §6): e a fronteira que a linha de fechamento declara como inicio do
 * periodo. Meses de 28, 29, 30 e 31 dias saem do calendario, nao de um 30 fixo.
 */
export function startOfCivilMonthInstant(month: string): Date {
  const [year, monthNumber] = civilMonthParts(month);
  return new Date(Date.UTC(year, monthNumber - 1, 1) + SP_OFFSET_MS);
}

/** Last instant of a civil month — 23:59:59.999 do ultimo dia, em Sao Paulo. */
export function endOfCivilMonthInstant(month: string): Date {
  const [year, monthNumber] = civilMonthParts(month);
  // Date.UTC(year, monthNumber, 1) e o primeiro dia do mes SEGUINTE (mesNumber e 0-indexado).
  return new Date(Date.UTC(year, monthNumber, 1) + SP_OFFSET_MS - 1);
}

const CIVIL_MONTH_NAMES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * Label of a civil month for a human reader, derived from the `YYYY-MM` string by table lookup.
 * No `Date` and no locale: montar o rotulo por `toLocaleDateString` reabre o deslocamento de
 * fuso que a regra acima evita (DEC-132). Retorna `null` para texto que nao e mes civil.
 */
export function civilMonthLabel(month: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return `${CIVIL_MONTH_NAMES_PT[monthNumber - 1]} de ${year}`;
}
