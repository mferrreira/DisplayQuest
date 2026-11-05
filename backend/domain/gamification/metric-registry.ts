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
  | "tasks_created"
  | "subtasks_completed"
  | "points"
  | "projects_joined"
  | "projects_led"
  | "deliverables_added"
  | "goals_defined"
  | "attachments_uploaded"
  | "activity_evidence_uploaded"
  | "activities_responsible"
  | "activities_completed"
  | "work_sessions"
  | "sessions_hours_total"
  | "weekly_hours_avg"
  | "weeks_perfect"
  | "streak_days"
  | "purchases_count"
  | "points_spent"
  | "reports_written"
  | "weekly_reports_count"
  | "certificates_generated"
  | "certificate_months"
  | "issues_reported"
  | "issues_resolved"
  | "lab_events_count"
  | "lab_responsibilities_completed"
  | "months_active"
  | "months_top3"
  | "months_won"
  | "profile_fields_filled"
  | "is_coordenador"
  | "is_gerente"
  | "is_laboratorista"
  | "is_gerente_projeto";

export const METRICS: readonly MetricSpec[] = [
  { id: "tasks_completed", label: "Tarefas concluídas", unit: "count" },
  { id: "tasks_created", label: "Tarefas criadas", unit: "count" },
  { id: "subtasks_completed", label: "Subtasks concluídas", unit: "count" },
  { id: "points", label: "Pontos", unit: "points" },
  { id: "projects_joined", label: "Projetos", unit: "count" },
  { id: "projects_led", label: "Projetos liderados", unit: "count" },
  { id: "deliverables_added", label: "Entregáveis cadastrados", unit: "count" },
  { id: "goals_defined", label: "Metas definidas", unit: "count" },
  { id: "attachments_uploaded", label: "Anexos enviados", unit: "count" },
  { id: "activity_evidence_uploaded", label: "Provas de atividade enviadas", unit: "count" },
  { id: "activities_responsible", label: "Atividades sob responsabilidade", unit: "count" },
  { id: "activities_completed", label: "Atividades aprovadas", unit: "count" },
  { id: "work_sessions", label: "Sessões de trabalho", unit: "count" },
  { id: "sessions_hours_total", label: "Horas totais em sessões", unit: "hours" },
  { id: "weekly_hours_avg", label: "Média de horas semanais", unit: "hours" },
  { id: "weeks_perfect", label: "Semanas com meta atingida", unit: "count" },
  { id: "streak_days", label: "Dias consecutivos", unit: "days" },
  { id: "purchases_count", label: "Compras", unit: "count" },
  { id: "points_spent", label: "Pontos gastos na loja", unit: "points" },
  { id: "reports_written", label: "Relatórios de projeto escritos", unit: "count" },
  { id: "weekly_reports_count", label: "Relatórios semanais", unit: "count" },
  { id: "certificates_generated", label: "Atestados gerados", unit: "count" },
  { id: "certificate_months", label: "Meses com atestado", unit: "count" },
  { id: "issues_reported", label: "Issues reportadas", unit: "count" },
  { id: "issues_resolved", label: "Issues resolvidas", unit: "count" },
  { id: "lab_events_count", label: "Eventos de laboratório", unit: "count" },
  { id: "lab_responsibilities_completed", label: "Responsabilidades finalizadas", unit: "count" },
  { id: "months_active", label: "Meses no quadro", unit: "count" },
  { id: "months_top3", label: "Meses no top 3", unit: "count" },
  { id: "months_won", label: "Meses vencidos", unit: "count" },
  { id: "profile_fields_filled", label: "Campos de perfil preenchidos", unit: "count" },
  { id: "is_coordenador", label: "É coordenador", unit: "count" },
  { id: "is_gerente", label: "É gerente", unit: "count" },
  { id: "is_laboratorista", label: "É laboratorista", unit: "count" },
  { id: "is_gerente_projeto", label: "É gerente de projeto", unit: "count" },
];

/** As métricas base, medidas pelas portas que já existiam na S01. */
export const BASE_METRIC_IDS: readonly MetricId[] = [
  "tasks_completed",
  "points",
  "projects_joined",
  "work_sessions",
  "weekly_hours_avg",
  "streak_days",
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
