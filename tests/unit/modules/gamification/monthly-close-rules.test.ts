/**
 * plan-v9 S02 (MODELO R5, R10, R11, CA1, CA6, CA7; DEC-226, ADR-004) — a aritmética do fechamento.
 *
 * Este arquivo foi escrito antes do código. Ele fixa quatro coisas que uma implementação escrita
 * primeiro tenderia a decidir sozinha:
 *
 *  1. qual mês a run fecha. Às 00:00 de 1 de novembro o mês civil em curso já é novembro, e o
 *     placar vivo ainda carrega outubro: a run fecha o mês ANTERIOR ao instante (R5). Um minuto
 *     antes da virada, ela ainda fecha setembro. É a fronteira que o cron `0 0 1 * *` atravessa.
 *  2. quem entra (DEC-226, resposta do dono contra o padrão do executor): toda pessoa com
 *     `status: active`, inclusive com placar zero. Quem está em `pending`, `rejected` ou
 *     `suspended` não recebe linha (CA7, R11).
 *  3. posição determinística. O quadro vivo ordena por valor e deixa empate nas mãos do Postgres;
 *     a linha fechada não pode, porque ela é lida depois e precisa ser a mesma linha. O desempate
 *     é valor decrescente, depois nome, depois id.
 *  4. instante nenhum é calculado dentro da regra: `closedAt` e as fronteiras do período entram e
 *     saem pela mão do chamador (mesma lição da DEC-132).
 */
import { describe, expect, it } from "vitest";

import { BOARD_TRACKS } from "@/backend/domain/gamification/board-tracks";
import {
  boardMonthWindow,
  closeTargetMonth,
  planMonthClose,
  type MonthClosePerson,
} from "@/backend/domain/gamification/month-close-rules";

const CLOSED_AT = new Date("2028-02-01T03:00:01.000Z"); // 00:00:01 de 1 de fevereiro em Sao Paulo

function person(over: Partial<MonthClosePerson> & { id: number; name: string }): MonthClosePerson {
  return {
    status: "active",
    currentMonthPoints: 0,
    ...over,
  };
}

describe("fechamento de mês — qual mês a run fecha (R5)", () => {
  it("a run das 00:00 de 1 de novembro fecha outubro", () => {
    expect(closeTargetMonth(new Date("2026-11-01T03:00:00.000Z"))).toBe("2026-10");
  });

  it("um minuto antes da virada ainda é o mês anterior ao que vai começar", () => {
    // 2026-11-01T02:59:59Z sao 23:59:59 de 31 de outubro em Sao Paulo: o mes civil e outubro.
    expect(closeTargetMonth(new Date("2026-11-01T02:59:59.000Z"))).toBe("2026-09");
  });

  it("a virada de ano fecha dezembro no instante de 1 de janeiro", () => {
    expect(closeTargetMonth(new Date("2027-01-01T03:00:00.000Z"))).toBe("2026-12");
  });
});

describe("fechamento de mês — o período gravado (MODELO §6)", () => {
  it("o período é o mês civil em instantes de Sao Paulo, não em meia-noite UTC", () => {
    const { periodStart, periodEnd } = boardMonthWindow("2026-10");
    expect(periodStart.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2026-11-01T02:59:59.999Z");
  });

  it("fevereiro de 2026 fecha em 28 dias e fevereiro de 2024 em 29", () => {
    expect(boardMonthWindow("2026-02").periodEnd.toISOString()).toBe("2026-03-01T02:59:59.999Z");
    expect(boardMonthWindow("2024-02").periodEnd.toISOString()).toBe("2024-03-01T02:59:59.999Z");
  });

  it("mes invalido nao inventa periodo", () => {
    expect(() => boardMonthWindow("2026-13")).toThrow(/mes civil invalido/);
    expect(() => boardMonthWindow("outubro")).toThrow(/mes civil invalido/);
  });
});

describe("fechamento de mês — quem recebe linha (DEC-226, CA1, CA7)", () => {
  const people = [
    person({ id: 3, name: "Ana", currentMonthPoints: 30 }),
    person({ id: 4, name: "Bruno", currentMonthPoints: 0 }),
    person({ id: 5, name: "Carla", status: "suspended", currentMonthPoints: 50 }),
    person({ id: 6, name: "Dora", status: "pending", currentMonthPoints: 12 }),
    person({ id: 7, name: "Elisa", status: "rejected", currentMonthPoints: 9 }),
    person({ id: 8, name: "Felipe", currentMonthPoints: -40 }),
  ];

  it("toda pessoa ativa entra, inclusive com placar zero (CA1)", () => {
    const plan = planMonthClose({ month: "2028-01", closedAt: CLOSED_AT, people });
    expect(plan.rows.map((row) => row.userId)).toEqual([3, 4, 8]);
    expect(plan.rows.map((row) => row.value)).toEqual([30, 0, -40]);
  });

  it("quem não está em active fica fora da linha, com o motivo nomeado (CA7, R11)", () => {
    const plan = planMonthClose({ month: "2028-01", closedAt: CLOSED_AT, people });
    expect(plan.excluded).toEqual([
      { userId: 5, status: "suspended" },
      { userId: 6, status: "pending" },
      { userId: 7, status: "rejected" },
    ]);
  });

  it("placar negativo é guardado exatamente como estava (CA6, R10)", () => {
    const plan = planMonthClose({ month: "2028-01", closedAt: CLOSED_AT, people });
    const felipe = plan.rows.find((row) => row.userId === 8);
    expect(felipe?.value).toBe(-40);
    expect(felipe?.position).toBe(3);
  });

  it("ninguém ativo é um mês fechado com zero linhas, não uma falha", () => {
    const plan = planMonthClose({
      month: "2028-01",
      closedAt: CLOSED_AT,
      people: [person({ id: 9, name: "Guilherme", status: "suspended", currentMonthPoints: 40 })],
    });
    expect(plan.rows).toEqual([]);
    expect(plan.excluded).toEqual([{ userId: 9, status: "suspended" }]);
  });
});

describe("fechamento de mês — posição (MODELO §6)", () => {
  it("a posição segue o valor decrescente e começa em 1, sem buraco", () => {
    const plan = planMonthClose({ month: "2028-01", closedAt: CLOSED_AT, people: [
      person({ id: 1, name: "Um", currentMonthPoints: 5 }),
      person({ id: 2, name: "Dois", currentMonthPoints: 50 }),
      person({ id: 3, name: "Tres", currentMonthPoints: 0 }),
    ] });
    expect(plan.rows.map((row) => [row.userId, row.position])).toEqual([[2, 1], [1, 2], [3, 3]]);
  });

  it("empate de valor desempata por nome e depois por id, e é a mesma ordem toda run", () => {
    const plan = planMonthClose({ month: "2028-01", closedAt: CLOSED_AT, people: [
      person({ id: 11, name: "Zeca", currentMonthPoints: 20 }),
      person({ id: 10, name: "Aki", currentMonthPoints: 20 }),
      person({ id: 13, name: "Aki", currentMonthPoints: 20 }),
      person({ id: 12, name: "Aki", currentMonthPoints: 20 }),
    ] });
    expect(plan.rows.map((row) => [row.userId, row.position])).toEqual([
      [10, 1],
      [12, 2],
      [13, 3],
      [11, 4],
    ]);
  });
});

describe("fechamento de mês — cada linha declara o que significa", () => {
  it("linha carrega mês, trilha, período, instante da run e o nome de exibição", () => {
    const { periodStart, periodEnd } = boardMonthWindow("2028-01");
    const plan = planMonthClose({ month: "2028-01", closedAt: CLOSED_AT, people: [
      person({ id: 21, name: "Beatriz", currentMonthPoints: 7 }),
    ] });
    expect(plan.rows).toEqual([
      {
        userId: 21,
        userName: "Beatriz",
        month: "2028-01",
        track: BOARD_TRACKS.MONTH_POINTS,
        value: 7,
        position: 1,
        periodStart,
        periodEnd,
        closedAt: CLOSED_AT,
      },
    ]);
  });

  it("a regra não olha o relógio: o instante da run é o que entrou (DEC-132)", () => {
    const outro = new Date("2029-05-01T03:00:00.000Z");
    const plan = planMonthClose({ month: "2029-04", closedAt: outro, people: [
      person({ id: 22, name: "Caio", currentMonthPoints: 1 }),
    ] });
    expect(plan.rows[0].closedAt).toBe(outro);
    expect(plan.rows[0].periodStart.toISOString()).toBe("2029-04-01T03:00:00.000Z");
  });
});
