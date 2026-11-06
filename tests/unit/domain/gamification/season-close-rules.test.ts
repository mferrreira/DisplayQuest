/**
 * plan-v20 S01 (DEC-252, DEC-253) — a aritmética do fechamento da temporada.
 *
 * Escrito antes do código. Fixa quatro coisas que uma implementação escrita primeiro decidiria
 * sozinha:
 *
 *  1. o ano que a run fecha: o ano civil que TERMINOU, não o ano em curso. Às 00:00 de 1 de
 *     janeiro de 2027 a run fecha a temporada 2026. Uma run em junho de 2026 fecha 2025.
 *  2. a temporada começa em 2026. Ano anterior é recusado nomeando o valor.
 *  3. o número da linha é `users.points` (o saldo), não a soma dos placares mensais — decisão
 *     do dono em 2026-11-06 (DEC-253). Negativo congela como está (DEC-39).
 *  4. o período declarado é o ano civil inteiro em instantes de Sao Paulo: 00:00 de 1 de
 *     janeiro ate 23:59:59.999 de 31 de dezembro, derivado da mesma disciplina da DEC-132.
 */
import { describe, expect, it } from "vitest";

import { BOARD_TRACKS } from "@/backend/domain/gamification/board-tracks";
import {
  boardSeasonWindow,
  closeTargetSeasonYear,
  planSeasonClose,
  seasonAlreadyClosedMessage,
  type SeasonClosePerson,
} from "@/backend/domain/gamification/season-close-rules";

const CLOSED_AT = new Date("2027-01-01T03:00:00.000Z"); // 00:00 de 1 de janeiro de 2027, Sao Paulo

function person(over: Partial<SeasonClosePerson> & { id: number; name: string }): SeasonClosePerson {
  return {
    status: "active",
    currentSeasonPoints: 0,
    ...over,
  };
}

describe("fechamento da temporada — qual ano a run fecha (DEC-254)", () => {
  it("a run das 00:00 de 1 de janeiro de 2027 fecha a temporada 2026", () => {
    expect(closeTargetSeasonYear(new Date("2027-01-01T03:00:00.000Z"))).toBe("2026");
  });

  it("uma run em junho de 2026 fecha o ano civil que já terminou (2025)", () => {
    expect(closeTargetSeasonYear(new Date("2026-06-15T12:00:00.000Z"))).toBe("2025");
  });

  it("a run de 1 de janeiro de 2026 fecha 2025 — o plano de 2025 é recusado depois", () => {
    // A primeira temporada é 2026 (DEC-255). A regra do ano é simples; quem recusa o ano
    // anterior à primeira temporada é o planSeasonClose, congelado abaixo.
    expect(closeTargetSeasonYear(new Date("2026-01-01T03:00:00.000Z"))).toBe("2025");
  });

  it("23:59:59 de 31 de dezembro ainda não fechou o ano — a temporada fecha na virada", () => {
    // 2026-12-31T20:59:59Z é 23:59:59 de 31 de dezembro em Sao Paulo. O ano 2026 só termina
    // às 23:59:59.999; o ano que terminou é 2025. A temporada 2026 fecha às 00:00 de 1 de
    // janeiro de 2027, depois do fechamento de dezembro.
    expect(closeTargetSeasonYear(new Date("2026-12-31T20:59:59.000Z"))).toBe("2025");
  });
});

describe("fechamento da temporada — o período gravado (DEC-252)", () => {
  it("o período é o ano civil inteiro em instantes de Sao Paulo", () => {
    const { periodStart, periodEnd } = boardSeasonWindow("2026");
    expect(periodStart.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2027-01-01T02:59:59.999Z");
  });

  it("2028 é bissexto e o período não encurta", () => {
    const { periodEnd } = boardSeasonWindow("2028");
    expect(periodEnd.toISOString()).toBe("2029-01-01T02:59:59.999Z");
  });
});

describe("fechamento da temporada — audiência, valor e posição (DEC-253)", () => {
  it("só pessoa active recebe linha; as outras saem nomeadas com o status", () => {
    const plan = planSeasonClose({
      year: "2026",
      closedAt: CLOSED_AT,
      people: [
        person({ id: 1, name: "Alice", currentSeasonPoints: 50 }),
        person({ id: 2, name: "Bruno", status: "suspended", currentSeasonPoints: 90 }),
        person({ id: 3, name: "Carla", status: "pending", currentSeasonPoints: 10 }),
        person({ id: 4, name: "Dela", currentSeasonPoints: 100 }),
      ],
    });
    expect(plan.rows.map((r) => r.userId)).toEqual([4, 1]);
    expect(plan.excluded).toEqual([
      { userId: 2, status: "suspended" },
      { userId: 3, status: "pending" },
    ]);
  });

  it("o valor da linha é o saldo da pessoa, negativo congelado como está", () => {
    const plan = planSeasonClose({
      year: "2026",
      closedAt: CLOSED_AT,
      people: [
        person({ id: 1, name: "Alice", currentSeasonPoints: -20 }),
        person({ id: 2, name: "Bruno", currentSeasonPoints: 0 }),
      ],
    });
    expect(plan.rows).toEqual([
      expect.objectContaining({ userId: 2, value: 0, position: 1 }),
      expect.objectContaining({ userId: 1, value: -20, position: 2 }),
    ]);
    expect(plan.rows[0].track).toBe(BOARD_TRACKS.SEASON_POINTS);
    expect(plan.rows[0].month).toBe("2026");
    expect(plan.rows[0].userName).toBe("Bruno");
  });

  it("desempate: valor decrescente, depois nome em ordem de código, depois id", () => {
    const plan = planSeasonClose({
      year: "2026",
      closedAt: CLOSED_AT,
      people: [
        person({ id: 5, name: "Zé", currentSeasonPoints: 70 }),
        person({ id: 1, name: "Ana", currentSeasonPoints: 70 }),
        person({ id: 2, name: "Ana", currentSeasonPoints: 70 }),
        person({ id: 3, name: "Bia", currentSeasonPoints: 70 }),
        person({ id: 4, name: "Ao", currentSeasonPoints: 70 }),
      ],
    });
    expect(plan.rows.map((r) => r.userId)).toEqual([1, 2, 4, 3, 5]);
  });

  it("ano anterior à primeira temporada é recusado nomeando o valor", () => {
    expect(() =>
      planSeasonClose({ year: "2025", closedAt: CLOSED_AT, people: [] }),
    ).toThrow(/2025/);
  });

  it("ano malformado é recusado nomeando o valor", () => {
    expect(() =>
      planSeasonClose({ year: "26", closedAt: CLOSED_AT, people: [] }),
    ).toThrow(/26/);
  });

  it("a mensagem de temporada já fechada é única e nomeia o ano", () => {
    expect(seasonAlreadyClosedMessage("2026")).toBe("A temporada do quadro já foi fechada: 2026");
  });
});
