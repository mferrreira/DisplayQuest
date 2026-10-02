// @vitest-environment node
/**
 * plan-v3 · batch 1.B — `backend/domain/task/points-rules.ts`.
 *
 * Cobre a regra nova inteira e, caso a caso, o que o plano promete (AC-P3-01, AC-P3-02).
 * O comportamento anterior está caracterizado em `domain.points-characterization.test.ts`;
 * a diferença entre os dois é declarada lá, não aqui.
 *
 * Todos os instantes abaixo estão ancorados no dia civil 2026-06-15 do laboratório
 * (UTC-3 fixo), que é o dia que a pessoa vê no relógio quando marca a tarefa como concluída.
 */
import { describe, expect, it } from "vitest";

import {
  EARLY_DELIVERY_MULTIPLIER,
  POINTS_PER_TASK,
  awardPointsForCompletion,
  calculateLatePenalty,
  daysLateForTask,
} from "@/backend/domain";

const DUE = "2026-06-15";

describe("plan-v3 · constantes da premiação", () => {
  it("10 pontos por tarefa, 1,5x para entrega adiantada (DEC-30, DEC-32)", () => {
    expect(POINTS_PER_TASK).toBe(10);
    expect(EARLY_DELIVERY_MULTIPLIER).toBe(1.5);
  });
});

describe("plan-v3 · AC-P3-01 — entregar no dia do prazo rende inteiro, não zero", () => {
  it("prazo date-only, entregue em qualquer hora do mesmo dia civil -> 10", () => {
    const instants = [
      "2026-06-15T03:00:00.000Z", // 00h00 de Brasília
      "2026-06-15T11:00:00.000Z", // 08h00
      "2026-06-15T18:00:00.000Z", // 15h00
      "2026-06-15T23:59:59.999Z", // 20h59
      "2026-06-16T02:00:00.000Z", // 23h00 de Brasília, ainda dia 15
    ];
    for (const iso of instants) {
      const completion = new Date(iso);
      expect(daysLateForTask({ dueDate: DUE }, completion)).toBe(0);
      expect(calculateLatePenalty({ dueDate: DUE }, completion)).toBe(0);
      expect(awardPointsForCompletion({ dueDate: DUE }, completion)).toBe(10);
    }
  });

  it("meia-noite UTC do dia do prazo é 21h de Brasília do dia 14: entrega adiantada -> 15", () => {
    // Pré-v3 esta instância ERA o prazo, e qualquer hora do dia contava como 1 dia de atraso.
    // Em v3 ela pertence ao dia civil 14/06, que é antes do prazo.
    expect(awardPointsForCompletion({ dueDate: DUE }, new Date("2026-06-15T00:00:00.000Z"))).toBe(15);
  });

  it("tarefa sem prazo -> 10, sem bônus e sem penalidade", () => {
    const completion = new Date("2026-06-15T18:00:00.000Z");
    expect(daysLateForTask({ dueDate: null }, completion)).toBe(0);
    expect(awardPointsForCompletion({ dueDate: null }, completion)).toBe(POINTS_PER_TASK);
  });
});

describe("plan-v3 · entrega adiantada", () => {
  it("um dia antes do prazo -> 15", () => {
    expect(daysLateForTask({ dueDate: DUE }, new Date("2026-06-14T12:00:00.000Z"))).toBe(0);
    expect(awardPointsForCompletion({ dueDate: DUE }, new Date("2026-06-14T12:00:00.000Z"))).toBe(15);
  });

  it("adiantamento largo continua em 15 (o multiplicador não escala com o antecipamento)", () => {
    expect(awardPointsForCompletion({ dueDate: DUE }, new Date("2026-05-01T12:00:00.000Z"))).toBe(15);
  });

  it("a fronteira é o dia civil, não a hora: 23h59min59s UTC de 14/06 ainda é adiantada", () => {
    expect(awardPointsForCompletion({ dueDate: DUE }, new Date("2026-06-15T02:59:59.999Z"))).toBe(15);
  });
});

describe("plan-v3 · atraso, preservando o valor negativo (DEC-39)", () => {
  it("1 dia civil de atraso -> 0", () => {
    const completion = new Date("2026-06-16T03:00:00.000Z"); // 00h00 de Brasília do dia 16
    expect(daysLateForTask({ dueDate: DUE }, completion)).toBe(1);
    expect(calculateLatePenalty({ dueDate: DUE }, completion)).toBe(10);
    expect(awardPointsForCompletion({ dueDate: DUE }, completion)).toBe(0);
  });

  it("2 dias de atraso -> -10 (penalidade sem piso)", () => {
    const completion = new Date("2026-06-17T12:00:00.000Z");
    expect(daysLateForTask({ dueDate: DUE }, completion)).toBe(2);
    expect(awardPointsForCompletion({ dueDate: DUE }, completion)).toBe(-10);
  });

  it("o caso medido na interface real: 619 dias de atraso -> -6180", () => {
    // Pré-v3 produzia -37140 com points=60 e ceil de fração de dia. Com 10 fixos e dias
    // inteiros, o número continua grande e negativo: é a regra, não um bug (PLAN.md §7).
    const completion = new Date("2026-10-02T18:00:00.000Z"); // 15h de Brasília
    expect(daysLateForTask({ dueDate: "2025-01-21" }, completion)).toBe(619);
    expect(calculateLatePenalty({ dueDate: "2025-01-21" }, completion)).toBe(6190);
    expect(awardPointsForCompletion({ dueDate: "2025-01-21" }, completion)).toBe(-6180);
  });
});

describe("plan-v3 · DEC-30/DEC-40 — task.points saiu do cálculo", () => {
  it("uma tarefa gravada com 100 pontos vale 10, como qualquer outra", () => {
    const legacyRow = { points: 100, dueDate: DUE };
    expect(awardPointsForCompletion(legacyRow, new Date("2026-06-15T18:00:00.000Z"))).toBe(10);
  });

  it("uma tarefa gravada com 0 pontos vale 10 (era isso que o gate `points > 0` impedia)", () => {
    const legacyRow = { points: 0, dueDate: DUE };
    expect(awardPointsForCompletion(legacyRow, new Date("2026-06-15T18:00:00.000Z"))).toBe(10);
  });
});

describe("plan-v3 · tolerância", () => {
  it("prazo ilegível conta como sem prazo, não como atraso infinito", () => {
    const completion = new Date("2026-06-15T18:00:00.000Z");
    expect(daysLateForTask({ dueDate: "sem data" }, completion)).toBe(0);
    expect(awardPointsForCompletion({ dueDate: "sem data" }, completion)).toBe(10);
  });

  it("string vazia conta como sem prazo", () => {
    expect(awardPointsForCompletion({ dueDate: "" }, new Date("2026-06-15T18:00:00.000Z"))).toBe(10);
  });
});
