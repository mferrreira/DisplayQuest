/**
 * plan-v15 S01 (MODELO R2/R3, CA1): vocabulário fechado de métricas e o critério v2.
 *
 * O motor não conhece métricas individuais — conhece o registro. Badge novo é INSERT de
 * dados; métrica nova é código + porta (S03 amplia as famílias). A validação da rota contra
 * o registro entra na S02; aqui a decisão de avaliação: métrica fora do registro nunca
 * concede — o caminho "condição desconhecida => true" do QUIRK-6C (badge-rules) morre.
 */

import { ValidationError } from "@/backend/domain/errors/DomainError";

export interface MetricSpec {
  id: MetricId;
  label: string;
  unit: "points" | "count" | "hours" | "days";
}

export type MetricId =
  | "tasks_completed"
  | "points"
  | "projects_joined"
  | "work_sessions"
  | "weekly_hours_avg"
  | "streak_days";

export const METRICS: readonly MetricSpec[] = [
  { id: "tasks_completed", label: "Tarefas concluídas", unit: "count" },
  { id: "points", label: "Pontos", unit: "points" },
  { id: "projects_joined", label: "Projetos", unit: "count" },
  { id: "work_sessions", label: "Sessões de trabalho", unit: "count" },
  { id: "weekly_hours_avg", label: "Média de horas semanais", unit: "hours" },
  { id: "streak_days", label: "Dias consecutivos", unit: "days" },
];

export const METRIC_IDS: readonly MetricId[] = METRICS.map((m) => m.id);

export function isMetricId(value: string): value is MetricId {
  return (METRIC_IDS as readonly string[]).includes(value);
}

export interface BadgeClause {
  metric: string;
  op: ">=";
  value: number;
}

export interface BadgeCriteriaV2 {
  version: 2;
  clauses: BadgeClause[];
}

export type BadgeMetricValues = Partial<Record<MetricId, number>>;

/**
 * Decisão pura do critério v2: todas as cláusulas em AND, `>=` contra o valor medido.
 * Cláusula vazia nunca concede. Métrica fora do registro ou sem valor medido: false.
 * Versão != 2 não é critério v2.
 */
export function criteriaV2Met(criteria: unknown, values: BadgeMetricValues): boolean {
  if (!criteria || typeof criteria !== "object") return false;
  const v2 = criteria as Partial<BadgeCriteriaV2>;
  if (v2.version !== 2 || !Array.isArray(v2.clauses)) return false;
  if (v2.clauses.length === 0) return false;
  for (const clause of v2.clauses) {
    if (!isMetricId(clause.metric)) return false;
    const measured = values[clause.metric];
    if (measured === undefined) return false;
    if (measured < clause.value) return false;
  }
  return true;
}

/**
 * plan-v15 S02 (MODELO R3/R6): validação estrita de criteria na ESCRITA de badge.
 * Aceita null/ausente (badge de concessão manual); o único formato escrevível é v2 com
 * clauses não vazia, métrica do registro, op `>=` e valor finito >= 1. O formato legado
 * de 2026 é recusado. Mensagem única: "Critério de badge inválido".
 */
export function validateBadgeCriteriaInput(criteria: unknown): BadgeCriteriaV2 | null {
  if (criteria === null || criteria === undefined) return null;
  const reject = (): never => {
    throw new ValidationError("Critério de badge inválido");
  };
  if (typeof criteria !== "object" || Array.isArray(criteria)) reject();
  const v2 = criteria as Partial<BadgeCriteriaV2>;
  if (v2.version !== 2) reject();
  const input: unknown = v2.clauses;
  if (Array.isArray(input) && input.length === 0) reject();
  if (!Array.isArray(input)) reject();
  const clauses = (input as BadgeClause[]).map((clause) => {
    if (!clause || typeof clause !== "object") reject();
    if (!isMetricId(clause.metric)) reject();
    if (clause.op !== ">=") reject();
    if (typeof clause.value !== "number" || !Number.isFinite(clause.value) || clause.value < 1) reject();
    return { metric: clause.metric, op: ">=" as const, value: clause.value };
  });
  return { version: 2, clauses };
}
