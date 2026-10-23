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
 * Abreviações do mês civil, na ordem do calendário. Mora no `time` porque o mês é do calendário,
 * não de uma tela: a grade do cronograma (V5-5) e o histórico mensal do placar (V8-7) mostram o
 * mesmo mês, e duas tabelas de `jan..dez` em dois domínios é a lição da DEC-90/96 (a régua virando
 * cópia).
 */
export const MONTH_ABBREVIATIONS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

/** `YYYY-MM` é mês civil — `2026-13` não é, e `2026-0` também não. */
export function isCivilMonthKey(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

/**
 * O rótulo do mês civil: `2026-03` é `mar/2026`. Nunca `new Date(...).toLocaleDateString` — o erro
 * que a DEC-132 fechou (`new Date("2026-03")` é 1º de março UTC e vira fevereiro no fuso do
 * laboratório). O chamador valida a forma ANTES de chamar, porque a frase de recusa é do chamador.
 */
export function civilMonthLabel(monthKey: string): string {
  const month = Number(monthKey.slice(5, 7));
  return `${MONTH_ABBREVIATIONS[month - 1]}/${monthKey.slice(0, 4)}`;
}
