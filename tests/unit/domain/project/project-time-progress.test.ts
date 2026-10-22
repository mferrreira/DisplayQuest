/**
 * V5-11 (DEC-63/132) — a regra pura do andamento temporal do projeto, congelada antes do
 * código.
 *
 * O que fica preso aqui:
 *   1. `data_final − dia_de_hoje` é ARITMÉTICA DE DIA CIVIL (DEC-132): `projects.endDate`
 *      é `YYYY-MM-DD` e o "hoje" entra como parâmetro, nunca `new Date()` dentro da regra.
 *   2. Sem data de término não há andamento a desenhar — o estado é `sem_datas` e nada é
 *      inventado (o projeto pode não ter período).
 *   3. O percentual é do TEMPO decorrido do período (início → término), não de tarefas:
 *      é o gráfico que o dono pediu ("data_final − dia_de_hoje"). V8-1 (DEC-215) tirou a
 *      premiação do projeto do sistema, então aqui só existe o relógio do período.
 *   4. Fora do período não existe percentual negativo nem dias negativos: antes do início
 *      o relógio está em 0; depois do término o projeto está `encerrado` a 100%.
 */
import { describe, expect, it } from "vitest";

import { projectTimeProgress } from "@/backend/domain";

describe("andamento temporal do projeto (V5-11)", () => {
  it("sem data de término é `sem_datas` — nada é inventado", () => {
    expect(projectTimeProgress({ startDate: "2026-02-01", endDate: null }, "2026-10-14")).toEqual({
      state: "sem_datas",
      totalDays: null,
      elapsedDays: null,
      remainingDays: null,
      daysUntilStart: null,
      daysSinceEnd: null,
      percent: 0,
    });
  });

  it("em execução: decorridos, faltantes e percentual do período", () => {
    // 2026-02-01 → 2026-10-31 = 272 dias; em 2026-10-14: 255 decorridos, 17 faltando.
    const progress = projectTimeProgress({ startDate: "2026-02-01", endDate: "2026-10-31" }, "2026-10-14");
    expect(progress).toEqual({
      state: "em_execucao",
      totalDays: 272,
      elapsedDays: 255,
      remainingDays: 17,
      daysUntilStart: null,
      daysSinceEnd: null,
      percent: 94,
    });
  });

  it("antes do início: relógio em 0, e o faltante até o término é informado", () => {
    const progress = projectTimeProgress({ startDate: "2026-11-01", endDate: "2026-12-31" }, "2026-10-14");
    expect(progress).toEqual({
      state: "antes_do_inicio",
      totalDays: 60,
      elapsedDays: 0,
      remainingDays: 78,
      daysUntilStart: 18,
      daysSinceEnd: null,
      percent: 0,
    });
  });

  it("depois do término é `encerrado` a 100% — sem dias nem percentual negativos", () => {
    const progress = projectTimeProgress({ startDate: "2026-02-01", endDate: "2026-09-30" }, "2026-10-14");
    expect(progress).toEqual({
      state: "encerrado",
      totalDays: 241,
      elapsedDays: 241,
      remainingDays: 0,
      daysUntilStart: null,
      daysSinceEnd: 14,
      percent: 100,
    });
  });

  it("sem data de início: faltante e estado existem, total e percentual não", () => {
    const running = projectTimeProgress({ startDate: null, endDate: "2026-10-31" }, "2026-10-14");
    expect(running).toEqual({
      state: "em_execucao",
      totalDays: null,
      elapsedDays: null,
      remainingDays: 17,
      daysUntilStart: null,
      daysSinceEnd: null,
      percent: 0,
    });

    const past = projectTimeProgress({ startDate: null, endDate: "2026-09-30" }, "2026-10-14");
    expect(past.state).toBe("encerrado");
    expect(past.remainingDays).toBe(0);
    expect(past.daysSinceEnd).toBe(14);
    expect(past.percent).toBe(0);
  });

  it("o dia exato do término ainda é `em_execucao` a 100% — o prazo é dentro (DEC-166)", () => {
    const progress = projectTimeProgress({ startDate: "2026-02-01", endDate: "2026-10-14" }, "2026-10-14");
    expect(progress.state).toBe("em_execucao");
    expect(progress.remainingDays).toBe(0);
    expect(progress.percent).toBe(100);
  });

  it("período de um dia: total 1, e a divisão nunca é por zero", () => {
    const progress = projectTimeProgress({ startDate: "2026-10-14", endDate: "2026-10-14" }, "2026-10-14");
    expect(progress.totalDays).toBe(1);
    expect(progress.percent).toBe(100);
  });

  it("instantâneo ISO entra pelo mesmo caminho de dia civil (DEC-132)", () => {
    // 2026-10-14T02:00:00Z ainda é 13/10 no laboratório — a regra lê o dia civil do
    // término, não o UTC do instantâneo: no dia 13 o período já fechou.
    const progress = projectTimeProgress(
      { startDate: "2026-02-01", endDate: "2026-10-14T02:00:00.000Z" },
      "2026-10-13",
    );
    expect(progress.state).toBe("em_execucao");
    expect(progress.remainingDays).toBe(0);
    expect(progress.percent).toBe(100);
  });

  it("data ilegível conta como ausente — a regra não adivina", () => {
    expect(projectTimeProgress({ startDate: null, endDate: "31/10/2026" }, "2026-10-14").state).toBe("sem_datas");
  });
});
