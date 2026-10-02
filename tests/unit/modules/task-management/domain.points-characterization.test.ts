// @vitest-environment node
/**
 * plan-v3 · Onda 1 — CARACTERIZAÇÃO legado × v3 do comportamento de pontos.
 *
 * 1.A escreveu este arquivo contra o código de produção de antes da Onda 1: a fórmula atual
 * era copiada (`legacyLatePenalty` / `legacyAward`) e comparada com as funções reais, o que
 * provava que a cópia era fiel. 1.B mudou as funções reais. Este arquivo então muda de papel:
 * as cópias legado deixam de espelhar a produção e passam a ser **documentação executável do
 * que existia**, e as asserções declaram caso a caso o que mudou e o que foi preservado.
 *
 * É isso que torna o batch auditável: o diff do código diz como mudou; este arquivo diz o que
 * o usuário percebia antes e o que passa a perceber.
 *
 * Caso que originou o plano — medido na interface real na captura do guia de 2026-10-02:
 *   "PONTOS 60 pts(agora: -37140 pts com penalidade)"
 *
 * TZ fixado: o espelho do frontend parseia data-only como meio-dia LOCAL
 * (`features/tasks/utils/move-rules.ts:134-136`); sem fuso determinístico os números dependeriam
 * da máquina. O laboratório opera em America/Sao_Paulo (UTC-3 fixo, sem DST desde 2019).
 */
process.env.TZ = "America/Sao_Paulo";

import { describe, expect, it } from "vitest";

import { awardPointsForCompletion, calculateLatePenalty } from "@/backend/domain";
import { latePenalty, projectedAward } from "@/features/tasks/utils/move-rules";

const DAY_MS = 1000 * 60 * 60 * 24;

/** Cópia congelada de `backend/domain/task/task-rules.ts:114-124` no estado pré-v3. */
function legacyLatePenalty(
  task: { points: number; dueDate?: string | null },
  completionDate: Date,
): number {
  if (!task.dueDate) return 0;
  const dueDate = new Date(task.dueDate);
  const daysLate = Math.ceil((completionDate.getTime() - dueDate.getTime()) / DAY_MS);
  if (daysLate <= 0) return 0;
  return daysLate * task.points;
}

/** Cópia congelada de `backend/domain/task/task-rules.ts:127-132` no estado pré-v3. */
function legacyAward(
  task: { points: number; dueDate?: string | null },
  completionDate: Date,
): number {
  return task.points - legacyLatePenalty(task, completionDate);
}

/** `tasks.dueDate` é `String?` e o formulário do quadro envia `YYYY-MM-DD` cru. */
const DUE_TODAY = "2026-06-15";

describe("plan-v3 · o comportamento pré-v3, preservado como execução", () => {
  it("prazo HOJE entregue HOJE: o dia inteiro rendia zero, menos a meia-noite UTC exata", () => {
    const sameDay = [
      "2026-06-15T05:00:00.000Z", // 02h de Brasília
      "2026-06-15T11:00:00.000Z", // 08h
      "2026-06-15T18:00:00.000Z", // 15h
      "2026-06-15T21:00:00.000Z", // 18h
      "2026-06-15T23:30:00.000Z", // 20h30
    ].map((iso) => new Date(iso));
    for (const completion of sameDay) {
      expect(legacyAward({ points: 10, dueDate: DUE_TODAY }, completion)).toBe(0);
    }
    expect(legacyAward({ points: 10, dueDate: DUE_TODAY }, new Date("2026-06-15T00:00:00.000Z"))).toBe(10);
  });

  it("ceil de fração de 24h: 23h contavam como 1 dia, 26h como 2", () => {
    expect(legacyLatePenalty({ points: 10, dueDate: "2026-06-14T13:00:00.000Z" }, new Date("2026-06-15T12:00:00.000Z"))).toBe(10);
    expect(legacyLatePenalty({ points: 10, dueDate: DUE_TODAY }, new Date("2026-06-16T02:00:00.000Z"))).toBe(20);
  });

  it("o número medido na interface: 60 pts, prazo 21/01/2025, concluída 02/10/2026 -> -37140", () => {
    const task = { points: 60, dueDate: "2025-01-21" };
    const completion = new Date("2026-10-02T18:00:00.000Z"); // 15h de Brasília
    expect(legacyLatePenalty(task, completion)).toBe(37200); // 620 dias x 60
    expect(legacyAward(task, completion)).toBe(-37140);
  });

  it("entrega adiantada não ganhava nada", () => {
    expect(legacyAward({ points: 10, dueDate: DUE_TODAY }, new Date("2026-06-14T12:00:00.000Z"))).toBe(10);
    expect(legacyAward({ points: 10, dueDate: DUE_TODAY }, new Date("2026-05-01T12:00:00.000Z"))).toBe(10);
  });
});

describe("plan-v3 1.B · legado × v3 — o que mudou para quem entrega no prazo", () => {
  const cases: Array<{ nome: string; iso: string; legado: number; v3: number }> = [
    { nome: "00h UTC do dia do prazo (21h de Brasília do dia 14)", iso: "2026-06-15T00:00:00.000Z", legado: 10, v3: 15 },
    { nome: "08h de Brasília do dia do prazo", iso: "2026-06-15T11:00:00.000Z", legado: 0, v3: 10 },
    { nome: "15h de Brasília do dia do prazo", iso: "2026-06-15T18:00:00.000Z", legado: 0, v3: 10 },
    { nome: "23h de Brasília do dia do prazo", iso: "2026-06-16T02:00:00.000Z", legado: -10, v3: 10 },
    { nome: "00h de Brasília do dia seguinte", iso: "2026-06-16T03:00:00.000Z", legado: -10, v3: 0 },
    { nome: "um dia antes do prazo", iso: "2026-06-14T12:00:00.000Z", legado: 10, v3: 15 },
    { nome: "dois dias depois do prazo", iso: "2026-06-17T12:00:00.000Z", legado: -20, v3: -10 },
  ];

  it("cada caso muda do jeito declarado no plano (AC-P3-01, AC-P3-02)", () => {
    for (const c of cases) {
      const completion = new Date(c.iso);
      expect(legacyAward({ points: 10, dueDate: DUE_TODAY }, completion)).toBe(c.legado);
      expect(awardPointsForCompletion({ dueDate: DUE_TODAY }, completion)).toBe(c.v3);
    }
  });

  it("o caso medido na interface: -37140 vira -6180 (10 fixos, dias inteiros, sem piso)", () => {
    const completion = new Date("2026-10-02T18:00:00.000Z");
    expect(legacyAward({ points: 60, dueDate: "2025-01-21" }, completion)).toBe(-37140);
    expect(awardPointsForCompletion({ dueDate: "2025-01-21" }, completion)).toBe(-6180);
  });
});

describe("plan-v3 1.B · legado × v3 — o que foi preservado", () => {
  it("sem prazo: penalidade 0 nos dois", () => {
    const completion = new Date("2026-06-15T18:00:00.000Z");
    expect(legacyLatePenalty({ points: 10, dueDate: null }, completion)).toBe(0);
    expect(calculateLatePenalty({ dueDate: null }, completion)).toBe(0);
  });

  it("prazo com hora próxima do meio-dia: os dois já concordavam (a divergência é do date-only)", () => {
    for (const due of ["2026-06-13T12:00:00.000Z", "2026-06-14T13:00:00.000Z"]) {
      const completion = new Date("2026-06-15T12:00:00.000Z");
      expect(legacyAward({ points: 10, dueDate: due }, completion)).toBe(
        awardPointsForCompletion({ dueDate: due }, completion),
      );
    }
  });

  it("DEC-39: a premiação continua podendo ficar negativa", () => {
    expect(legacyAward({ points: 10, dueDate: "2026-06-13T12:00:00.000Z" }, new Date("2026-06-15T12:00:00.000Z"))).toBe(-10);
    expect(awardPointsForCompletion({ dueDate: "2026-06-13T12:00:00.000Z" }, new Date("2026-06-15T12:00:00.000Z"))).toBe(-10);
  });
});

describe("plan-v3 1.C · o espelho do frontend convergeu com o backend (R5 encerrada)", () => {
  /**
   * `latePenalty` / `projectedAward` (features/tasks/utils/move-rules.ts) deixaram de ter
   * matemática própria e delegam a `points-rules`. Os mesmos instantes em que a divergência foi
   * medida em 1.B agora produzem o mesmo número nos dois lados — é a prova de AC-P3-02.
   */
  const cases: Array<{ nome: string; iso: string; esperado: number }> = [
    { nome: "08h de Brasília do dia do prazo", iso: "2026-06-15T11:00:00.000Z", esperado: 10 },
    { nome: "23h de Brasília do dia do prazo", iso: "2026-06-16T02:00:00.000Z", esperado: 10 },
    { nome: "um dia antes do prazo", iso: "2026-06-14T12:00:00.000Z", esperado: 15 },
    { nome: "dois dias depois do prazo", iso: "2026-06-17T12:00:00.000Z", esperado: -10 },
  ];

  it("cartão e servidor produzem o mesmo número em cada caso que divergia", () => {
    for (const c of cases) {
      const completion = new Date(c.iso);
      const task = { points: 10, dueDate: DUE_TODAY };
      expect(projectedAward(task, completion)).toBe(c.esperado);
      expect(awardPointsForCompletion(task, completion)).toBe(c.esperado);
      expect(latePenalty(task, completion)).toBe(calculateLatePenalty(task, completion));
    }
  });

  it("e o número exibido não depende mais do fuso da máquina (a âncora é o domínio)", () => {
    const completion = new Date("2026-06-15T11:00:00.000Z");
    const task = { points: 10, dueDate: DUE_TODAY };
    expect(projectedAward(task, completion)).toBe(10);
    expect(latePenalty(task, completion)).toBe(0);
  });
});
