/**
 * plan-v15 S10 (R7, CA4) — a regra pura do progresso "X de Y".
 *
 * O que este arquivo trava:
 *  - a cláusula mais distante é a de MENOR razão, nunca a média;
 *  - métrica sem valor medido não entra na conta; criteria sem cláusula mensurável não tem progresso;
 *  - o X mostrado é cortado no target (12 de 10 aparece como 10 de 10 — quem passou é conquistada,
 *    o corte é só da exibição);
 *  - progressLabel é a frase "X de Y" da tela.
 */
import { describe, expect, it } from "vitest";

import { badgeProgressFor, progressLabel } from "@/backend/domain";

const v2 = (clauses: Array<{ metric: string; op: string; value: number }>) =>
  ({ version: 2, clauses }) as any;

describe("badgeProgressFor (cláusula mais distante, nunca média)", () => {
  it("duas cláusulas: a de menor razão vence (7/10 = 0.7 < 15/20 = 0.75)", () => {
    const values = { tasks_completed: 7, points: 15 } as any;
    const p = badgeProgressFor(values, v2([
      { metric: "tasks_completed", op: ">=", value: 10 },
      { metric: "points", op: ">=", value: 20 },
    ]));
    expect(p).toEqual({ value: 7, target: 10, metric: "tasks_completed" });
    expect(progressLabel(p!)).toBe("7 de 10");
  });

  it("métrica sem valor medido não entra: só a cláusula mensurável conta", () => {
    const values = { weeks_perfect: 2 } as any;
    const p = badgeProgressFor(values, v2([
      { metric: "certificates_generated", op: ">=", value: 6 },
      { metric: "weeks_perfect", op: ">=", value: 4 },
    ]));
    expect(p).toEqual({ value: 2, target: 4, metric: "weeks_perfect" });
  });

  it("nenhuma cláusula mensurável: sem progresso", () => {
    expect(badgeProgressFor({}, v2([{ metric: "streak_days", op: ">=", value: 3 }]))).toBeNull();
    expect(badgeProgressFor({ lab_events_count: 1 } as any, v2([{ metric: "lab_events_count", op: ">=", value: 0 }]))).toBeNull();
  });

  it("valor acima do target é cortado no target na exibição", () => {
    const p = badgeProgressFor({ tasks_completed: 12 } as any, v2([{ metric: "tasks_completed", op: ">=", value: 10 }]));
    expect(p).toEqual({ value: 10, target: 10, metric: "tasks_completed" });
    expect(progressLabel(p!)).toBe("10 de 10");
  });

  it("empate de razão mantém a primeira cláusula mensurável (ordem do criteria)", () => {
    const values = { tasks_completed: 5, points: 100 } as any;
    const p = badgeProgressFor(values, v2([
      { metric: "tasks_completed", op: ">=", value: 10 },
      { metric: "points", op: ">=", value: 200 },
    ]));
    expect(p!.metric).toBe("tasks_completed");
  });
});
