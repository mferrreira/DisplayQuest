// @vitest-environment jsdom
/**
 * plan-v13 S05 — regras puras dos três cards de atividade do Dashboard (regra 4 do MODELO).
 *
 * Congelam:
 *   - a janela de meses: min(firstMonth) a max(lastMonth) do recorte, inclusiva; recorte sem
 *     atividades = 12 meses ancorada no mês atual (DEC-151);
 *   - a contagem mensal: cada barra conta as atividades cujo período COBRE o mês, dividida em
 *     DONE e pendentes;
 *   - atrasada = hoje > fim do período; o próprio dia do prazo é dentro (DEC-64);
 *   - até 5 linhas, ordem determinística (projectId asc, order asc, id asc).
 *
 * O calendário vem do domínio (`backend/domain/project` — única fonte da regra de mês e
 * atraso, DEC-132/64); estas funções só agregam para a tela.
 */
import { describe, expect, it } from "vitest";

import {
  activityMonthCounts,
  activityStatusCounts,
  chartActivityWindow,
  overdueActivityLines,
} from "@/features/projects/utils/activity-chart-rules";
import type { ActivityChartRow } from "@/features/projects/utils/activity-chart-rules";

function row(overrides: Partial<ActivityChartRow> & { id: number; projectId: number }): ActivityChartRow {
  return {
    order: 1,
    status: "OPEN",
    description: `Etapa ${overrides.id}`,
    firstMonth: "2026-04",
    lastMonth: "2026-06",
    ...overrides,
  };
}

const TODAY = "2026-11-04";

describe("chartActivityWindow — a janela de meses do recorte", () => {
  it("min(firstMonth) a max(lastMonth), inclusiva", () => {
    const rows = [
      row({ id: 1, projectId: 1, firstMonth: "2026-04", lastMonth: "2026-06" }),
      row({ id: 2, projectId: 2, firstMonth: "2026-01", lastMonth: "2026-02" }),
      row({ id: 3, projectId: 3, firstMonth: "2026-10", lastMonth: "2026-12" }),
    ];
    const months = chartActivityWindow(rows, TODAY);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-01");
    expect(months[11]).toBe("2026-12");
  });

  it("recorte sem atividades: 12 meses ancorada no mês atual (DEC-151)", () => {
    const months = chartActivityWindow([], TODAY);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-11");
    expect(months[11]).toBe("2027-10");
  });

  it("uma atividade de um único mês fecha a janela naquele mês", () => {
    expect(chartActivityWindow([row({ id: 1, projectId: 1, firstMonth: "2026-06", lastMonth: "2026-06" })], TODAY)).toEqual(["2026-06"]);
  });
});

describe("activityMonthCounts — a contagem por mês", () => {
  it("cada barra conta as atividades que cobrem o mês, dividida em DONE e pendentes", () => {
    const rows = [
      row({ id: 1, projectId: 1, firstMonth: "2026-01", lastMonth: "2026-03", status: "DONE" }),
      row({ id: 2, projectId: 1, firstMonth: "2026-02", lastMonth: "2026-04", status: "OPEN" }),
      row({ id: 3, projectId: 2, firstMonth: "2026-03", lastMonth: "2026-04", status: "COMPLETION_REQUESTED" }),
    ];
    const months = ["2026-01", "2026-02", "2026-03", "2026-04"];
    const counts = activityMonthCounts(rows, months);
    expect(counts.map((c) => c.month)).toEqual(months);
    expect(counts[0]).toEqual({ month: "2026-01", done: 1, pending: 0 });
    expect(counts[1]).toEqual({ month: "2026-02", done: 1, pending: 1 });
    expect(counts[2]).toEqual({ month: "2026-03", done: 1, pending: 2 });
    expect(counts[3]).toEqual({ month: "2026-04", done: 0, pending: 2 });
  });
});

describe("activityStatusCounts — as contagens por status", () => {
  it("os três status aparecem sempre, na ordem do domínio, com suas contagens", () => {
    const rows = [
      row({ id: 1, projectId: 1, status: "OPEN" }),
      row({ id: 2, projectId: 1, status: "COMPLETION_REQUESTED" }),
      row({ id: 3, projectId: 2, status: "DONE" }),
      row({ id: 4, projectId: 2, status: "DONE" }),
    ];
    expect(activityStatusCounts(rows)).toEqual([
      { status: "OPEN", count: 1 },
      { status: "COMPLETION_REQUESTED", count: 1 },
      { status: "DONE", count: 2 },
    ]);
  });
});

describe("overdueActivityLines — as atividades atrasadas", () => {
  const names = new Map([[1, "Pesquisa em IA"], [2, "Automação"]]);

  it("o próprio dia do prazo é dentro (DEC-64); o dia seguinte é atraso", () => {
    const row = { id: 1, projectId: 1, order: 1, status: "OPEN", description: "Coleta", firstMonth: "2026-09", lastMonth: "2026-10" };
    expect(overdueActivityLines([row], names, "2026-10-31")).toHaveLength(0);
    expect(overdueActivityLines([row], names, "2026-11-01")).toHaveLength(1);
    const line = overdueActivityLines([row], names, "2026-11-01")[0];
    expect(line).toMatchObject({ projectId: 1, projectName: "Pesquisa em IA", description: "Coleta", periodoFim: "2026-10-31" });
  });

  it("DONE não é atrasada; ordem projectId asc, order asc; cap de 5 linhas", () => {
    const rows = [
      row({ id: 10, projectId: 2, order: 1, description: "Deploy", lastMonth: "2026-09", status: "DONE" }),
      row({ id: 11, projectId: 2, order: 2, lastMonth: "2026-09" }),
      row({ id: 12, projectId: 1, order: 3, lastMonth: "2026-08" }),
      row({ id: 13, projectId: 1, order: 1, lastMonth: "2026-10" }),
      row({ id: 14, projectId: 1, order: 2, lastMonth: "2026-10" }),
      row({ id: 15, projectId: 1, order: 4, lastMonth: "2026-10" }),
    ];
    const lines = overdueActivityLines(rows, names, TODAY);
    // Projeto 1 primeiro (projectId asc), dentro dele order asc: 13, 14, 12, 15; depois o 11 do
    // projeto 2. O 10 é DONE e não entra — atividade concluída não deve ao prazo.
    expect(lines.map((l) => l.id)).toEqual([13, 14, 12, 15, 11]);
  });
});
