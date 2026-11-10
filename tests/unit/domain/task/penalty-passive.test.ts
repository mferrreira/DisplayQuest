/**
 * plan-v15 S06 (R10/R12) — a redução de penalidade como regra pura.
 *
 * O que este arquivo trava:
 *  - `latePenaltyForCompletion` mede a penalidade no MESMO calendário da premiação
 *    (dias civis após o prazo × 10, sem piso);
 *  - `penaltyWithReduction` corta a soma de pct a 100% e nunca deixa a penalidade
 *    virar número positivo de prêmio: o resultado é `round(P × (1 − Σ))` com piso 0;
 *  - a sequência escrita do prêmio de tarefa: base fundido + penalidade devolvida na
 *    forma reduzida, e o bônus multiplica o resultado. Cap +100% no bônus.
 */
import { describe, expect, it } from "vitest";

import { applyPassiveBonus, penaltyWithReduction, taskAwardPoints } from "@/backend/domain";
import { latePenaltyForCompletion } from "@/backend/domain";

const dueDate = "2026-10-01";

describe("domain/task: latePenaltyForCompletion", () => {
  it("3 dias civis após o prazo: 30 pts de penalidade", () => {
    expect(latePenaltyForCompletion({ dueDate }, new Date("2026-10-04T12:00:00Z"))).toBe(30);
  });

  it("sem prazo: penalidade 0", () => {
    expect(latePenaltyForCompletion({ dueDate: null }, new Date("2026-10-04T12:00:00Z"))).toBe(0);
  });

  it("no dia do prazo: penalidade 0 (o próprio dia é dentro)", () => {
    expect(latePenaltyForCompletion({ dueDate }, new Date("2026-10-01T12:00:00Z"))).toBe(0);
  });
});

describe("domain/gamification: penaltyWithReduction (R10, cap 100%)", () => {
  it("sem passiva: a penalidade continua a mesma", () => {
    expect(penaltyWithReduction(30, [])).toBe(30);
  });

  it("redução de 10%: 30 viram 27", () => {
    expect(penaltyWithReduction(30, [{ kind: "penaltyReduction", pct: 0.1 }])).toBe(27);
  });

  it("60% + 50% são cortados a 100%: a penalidade vira 0, nunca negativa", () => {
    expect(penaltyWithReduction(30, [{ kind: "penaltyReduction", pct: 0.6 }, { kind: "penaltyReduction", pct: 0.5 }])).toBe(0);
  });

  it("penalidades de 0 ficam 0", () => {
    expect(penaltyWithReduction(0, [{ kind: "penaltyReduction", pct: 0.5 }])).toBe(0);
  });
});

describe("sequência escrita do prêmio de tarefa com penalidade e bônus", () => {
  it("base 100, 3 dias de atraso, redução 10% e bônus 10%: crédito 80", () => {
    const penalty = 30;
    const taskPoints = taskAwardPoints(100) - penalty; // 70, o número fundido que a rota manda
    const effects = [{ kind: "penaltyReduction" as const, pct: 0.1 }, { kind: "bonus" as const, pct: 0.1 }];

    const baseAfterReduction = taskPoints + penalty - penaltyWithReduction(penalty, effects); // 70 + 30 − 27 = 73
    expect(baseAfterReduction).toBe(73);
    expect(applyPassiveBonus(baseAfterReduction, effects)).toBe(80); // 73 × 1,1 = 80,3 → 80
  });

  it("sem penalidade, só o bônus: 100 × 1,1 = 110", () => {
    const effects = [{ kind: "bonus" as const, pct: 0.1 }];
    const baseAfterReduction = 100 + 0 - penaltyWithReduction(0, effects);
    expect(applyPassiveBonus(baseAfterReduction, effects)).toBe(110);
  });

  it("redução de 100% devolve a penalidade inteira ao base", () => {
    const effects = [{ kind: "penaltyReduction" as const, pct: 1.5 }];
    const taskPoints = 70;
    const baseAfterReduction = taskPoints + 30 - penaltyWithReduction(30, effects);
    expect(baseAfterReduction).toBe(100);
    expect(applyPassiveBonus(baseAfterReduction, effects)).toBe(100);
  });
});
