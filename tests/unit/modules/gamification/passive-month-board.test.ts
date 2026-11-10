/**
 * plan-v15 S07 (R13, CA8) — o placar do mês é o número que a ESCRITA do prêmio deposita.
 *
 * O multiplicador não entra no fechamento nem na leitura do quadro: ele entra na escrita
 * do prêmio, que incrementa `users.currentMonthPoints` com o valor aplicado. O que este
 * arquivo trava:
 *  - a escrita do award leva o valor multiplicado (o número que alimenta o placar);
 *  - `planMonthClose` ordena e numera pela grandeza aplicada, e grava o valor como está
 *    (R13: o fechamento não recalcula);
 *  - meses já fechados não são tocados por ninguém (os guardas de fechamento vivo existem
 *    em `monthly-board-close`; aqui entra a ordem aplicada da posição).
 */
import { describe, expect, it } from "vitest";

import { planMonthClose } from "@/backend/domain";
import { applyPassiveBonus } from "@/backend/domain";

describe("S07 — escrita do prêmio alimenta o placar do mês com o multiplicador", () => {
  it("a escrita do prêmio com +10% deposita 110 no placar", () => {
    const written = applyPassiveBonus(100, [{ kind: "bonus", pct: 0.1 }]);
    expect(written).toBe(110);
  });

  it("o placar ordena pelo valor aplicado e a posição vem da ordem aplicada", () => {
    // A escreveu 110 (passiva +10% sobre 100); B escreveu 100 no base; C escreveu 44 (+10% sobre 40).
    const plan = planMonthClose({
      month: "2026-11",
      closedAt: new Date("2026-12-01T02:00:00Z"),
      people: [
        { id: 2, name: "B", status: "active", currentMonthPoints: 100 },
        { id: 1, name: "A", status: "active", currentMonthPoints: 110 },
        { id: 3, name: "C", status: "active", currentMonthPoints: 44 },
      ],
    });

    expect(plan.rows.map((r) => r.userId)).toEqual([1, 2, 3]);
    expect(plan.rows.map((r) => r.position)).toEqual([1, 2, 3]);
    // R13: o fechamento grava o valor como está — 110, não a conta base 100.
    expect(plan.rows.map((r) => r.value)).toEqual([110, 100, 44]);
  });

  it("um mês fechado não é recalculado: a posição da escrita aplicada permanece", () => {
    // A linha do fechamento é idêntica ao que o placar tinha no último dia — nenhuma
    // re-aritmética de passiva acontece no fechamento (R11/R13, meses fechados intocados).
    const plan = planMonthClose({
      month: "2026-11",
      closedAt: new Date("2026-12-01T02:00:00Z"),
      people: [
        { id: 1, name: "A", status: "active", currentMonthPoints: 110 },
        { id: 2, name: "B", status: "active", currentMonthPoints: 100 },
      ],
    });
    const samePeople = plan.rows.map((r) => ({ id: r.userId, name: r.userName, status: "active" as const, currentMonthPoints: r.value }));
    const second = planMonthClose({ month: "2026-11", closedAt: new Date("2026-12-01T02:00:00Z"), people: samePeople });
    expect(second.rows).toEqual(plan.rows);
  });
});
