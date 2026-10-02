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
