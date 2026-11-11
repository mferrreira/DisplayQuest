import {
  ACTIVITY_STATUSES,
  addMonths,
  activityPeriod,
  CRONOGRAMA_FALLBACK_MONTHS,
  isActivityOverdue,
  monthKeyOfCivilDay,
  type ActivityStatus,
} from "@/backend/domain";

/**
 * plan-v13 S05 (regra 4 do MODELO) — as regras dos três cards de atividade da aba Dashboard.
 *
 * Estas funções só agregam para a tela. O calendário é todo do domínio: a janela de meses segue
 * a regra da grade (DEC-151: recorte sem atividades = 12 meses ancorada no mês atual), o atraso
 * é a regra da varredura do cron (DEC-64: o próprio dia do prazo é dentro), o rótulo de mês é o
 * do token (`monthColumnLabel`, DEC-132 — nada de `new Date` em regra de calendário).
 *
 * A linha de dados é a que a rota agregada da S04 devolve, com `description` (a tela nomeia a
 * etapa na lista de atrasadas).
 */
export interface ActivityChartRow {
  id: number;
  projectId: number;
  order: number;
  status: string;
  description: string;
  firstMonth: string;
  lastMonth: string;
}

export interface MonthCount {
  month: string;
  done: number;
  pending: number;
}

export interface StatusCount {
  status: ActivityStatus;
  count: number;
}

export interface OverdueLine {
  id: number;
  projectId: number;
  projectName: string;
  description: string;
  periodoFim: string;
}

/** Cap de linhas da lista de atrasadas — regra 4 do MODELO. */
export const OVERDUE_LINE_LIMIT = 5;

/**
 * Janela de meses do recorte: min(firstMonth) a max(lastMonth), inclusiva. Recorte sem
 * atividades: 12 meses ancorada no mês atual (DEC-151 — é o mesmo fallback da grade do
 * cronograma, medido no V6-11j).
 */
export function chartActivityWindow(rows: readonly ActivityChartRow[], today: string): string[] {
  if (rows.length === 0) {
    const first = monthKeyOfCivilDay(today);
    return Array.from({ length: CRONOGRAMA_FALLBACK_MONTHS }, (_, i) => addMonths(first, i));
  }
  let first = rows[0].firstMonth;
  let last = rows[0].lastMonth;
  for (const row of rows) {
    if (row.firstMonth < first) first = row.firstMonth;
    if (row.lastMonth > last) last = row.lastMonth;
  }
  const months: string[] = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) months.push(m);
  return months;
}

/** Cada barra conta as atividades cujo período COBRE o mês, dividida em DONE e pendentes. */
export function activityMonthCounts(rows: readonly ActivityChartRow[], months: readonly string[]): MonthCount[] {
  return months.map((month) => {
    let done = 0;
    let pending = 0;
    for (const row of rows) {
      if (row.firstMonth <= month && month <= row.lastMonth) {
        if (row.status === "DONE") done += 1;
        else pending += 1;
      }
    }
    return { month, done, pending };
  });
}

/** Os três status aparecem sempre, na ordem do domínio — o gráfico não some com status zerado. */
export function activityStatusCounts(rows: readonly ActivityChartRow[]): StatusCount[] {
  return ACTIVITY_STATUSES.map((status) => ({ status, count: rows.filter((row) => row.status === status).length }));
}

/**
 * Atrasadas: `isActivityOverdue` da varredura do cron, ordem projectId asc → order asc → id asc,
 * cap de 5. A linha nomeia projeto + etapa; o nome do projeto vem da tela (a rota agregada não
 * o devolve — quem tem a lista de projetos é o recorte).
 *
 * DONE nunca é atrasada: a atividade concluída não deve ao prazo. `isActivityOverdue` só lê os
 * meses, e o status é a trava da tela aqui — o scan do cron (DEC-64) pula DONE pelo próprio use
 * case; o card não pode mostrar o que a varredura não notificaria.
 */
export function overdueActivityLines(
  rows: readonly ActivityChartRow[],
  projectNames: ReadonlyMap<number, string>,
  today: string,
  limit = OVERDUE_LINE_LIMIT,
): OverdueLine[] {
  return rows
    .filter((row) => row.status !== "DONE" && isActivityOverdue({ firstMonth: row.firstMonth, lastMonth: row.lastMonth }, today))
    .sort((a, b) => a.projectId - b.projectId || a.order - b.order || a.id - b.id)
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: projectNames.get(row.projectId) ?? "—",
      description: row.description,
      periodoFim: activityPeriod(row.firstMonth, row.lastMonth).periodoFim,
    }));
}
