/**
 * plan-v15 S01 (MODELO R2/R3, CA1) — o registro de métricas e o critério v2.
 *
 * O que este arquivo trava:
 *  - o vocabulário de métricas é fechado: a lista base é a medida, rótulo e unidade existem;
 *  - `criteriaV2Met` é pura: todas as cláusulas em AND, `>=` contra o valor medido;
 *  - cláusula vazia nunca concede; métrica fora do registro nunca concede (o caminho
 *    "condição desconhecida => true" do QUIRK-6C morre aqui);
 *  - versão != 2 não é critério v2.
 */
import { describe, expect, it } from "vitest";

import { BASE_METRIC_IDS, METRICS, METRIC_IDS, isMetricId, criteriaV2Met } from "@/backend/domain";

describe("domain/gamification: metric-registry", () => {
  it("vocabulário fechado das métricas do registro completo", () => {
    expect(METRIC_IDS).toEqual([
      "tasks_completed",
      "tasks_created",
      "subtasks_completed",
      "points",
      "projects_joined",
      "projects_led",
      "deliverables_added",
      "goals_defined",
      "attachments_uploaded",
      "activity_evidence_uploaded",
      "activities_responsible",
      "activities_completed",
      "work_sessions",
      "sessions_hours_total",
      "weekly_hours_avg",
      "weeks_perfect",
      "streak_days",
      "purchases_count",
      "points_spent",
      "reports_written",
      "weekly_reports_count",
      "certificates_generated",
      "certificate_months",
      "issues_reported",
      "issues_resolved",
      "lab_events_count",
      "lab_responsibilities_completed",
      "months_active",
      "months_top3",
      "months_won",
      "profile_fields_filled",
      "is_coordenador",
      "is_gerente",
      "is_laboratorista",
      "is_gerente_projeto",
    ]);
    for (const metric of METRICS) {
      expect(metric.label).toBeTruthy();
      expect(["points", "count", "hours", "days"]).toContain(metric.unit);
    }
    expect(METRICS.map((m) => m.id)).toEqual([...METRIC_IDS]);
    expect(BASE_METRIC_IDS).toEqual([
      "tasks_completed",
      "points",
      "projects_joined",
      "work_sessions",
      "weekly_hours_avg",
      "streak_days",
    ]);
  });

  it("isMetricId aceita só métricas do registro", () => {
    expect(isMetricId("tasks_completed")).toBe(true);
    expect(isMetricId("streak_days")).toBe(true);
    expect(isMetricId("badges_won")).toBe(false);
    expect(isMetricId("")).toBe(false);
    expect(isMetricId(3 as unknown as string)).toBe(false);
  });

  describe("criteriaV2Met", () => {
    const clause = (metric: string, value: number) => ({ metric, op: ">=" as const, value });
    const v2 = (clauses: ReturnType<typeof clause>[]) => ({ version: 2 as const, clauses });

    it("cláusula atingida => true", () => {
      expect(criteriaV2Met(v2([clause("tasks_completed", 5)]), { tasks_completed: 5 })).toBe(true);
    });

    it("cláusula não atingida => false", () => {
      expect(criteriaV2Met(v2([clause("tasks_completed", 5)]), { tasks_completed: 4 })).toBe(false);
    });

    it("todas as cláusulas devem ser satisfeitas", () => {
      const values = { tasks_completed: 10, points: 50 };
      expect(criteriaV2Met(v2([clause("tasks_completed", 5), clause("points", 100)]), values)).toBe(false);
      expect(criteriaV2Met(v2([clause("tasks_completed", 5), clause("points", 50)]), values)).toBe(true);
    });

    it("lista vazia nunca concede", () => {
      expect(criteriaV2Met(v2([]), { tasks_completed: 999, points: 999 })).toBe(false);
    });

    it("métrica fora do registro nunca concede (QUIRK-6C morre)", () => {
      expect(criteriaV2Met(v2([clause("coordenador", 1)]), { tasks_completed: 999 })).toBe(false);
    });

    it("métrica sem valor medido => false", () => {
      expect(criteriaV2Met(v2([clause("streak_days", 7)]), { tasks_completed: 10 })).toBe(false);
    });

    it("versão != 2 não é critério v2", () => {
      expect(criteriaV2Met({ version: 1, clauses: [clause("tasks_completed", 5)] }, { tasks_completed: 999 })).toBe(false);
      expect(criteriaV2Met({ tasks: 5 }, { tasks_completed: 999 })).toBe(false);
      expect(criteriaV2Met(null, { tasks_completed: 999 })).toBe(false);
    });
  });
});
