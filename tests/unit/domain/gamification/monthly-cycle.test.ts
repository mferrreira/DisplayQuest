/**
 * plan-v8 V8-2 (DEC-212) — as regras puras do fechamento mensal, congeladas aqui antes do
 * use case e do cron: qual mês fecha, onde fica a janela, quem ganha snapshot e o que a coluna
 * recebe.
 *
 * O que cada caso segura:
 *   - o mês fechado é o ANTERIOR ao instante da run, em dia civil do laboratório (a rotina roda
 *     dia 1 às 00:00 SP, adiante do sweep das 23:59 — o mês a fotografar nunca é o do relógio);
 *   - a janela do mês é `[00:00 SP, 00:00 SP do mês seguinte)` — meio-noite UTC não é meio-noite
 *     daqui (DEC-132), e o corte exclusivo é o que mantém dentro uma tarefa das 23:59:59;
 *   - a audiência do snapshot é ampla (saldo ≠ 0 OU atividade no mês), não "usuários ativos";
 *   - a coluna sempre recebe 0, e o negativo sobrevive só no snapshot (Q4 do modelo mensal).
 */
import { describe, expect, it } from "vitest";

import {
  MONTH_KEY_PATTERN,
  POINTS_AFTER_MONTH_CLOSE,
  closingMonthOfInstant,
  monthWindow,
  shouldSnapshotClosedMonth,
} from "@/backend/domain/gamification";

describe("ciclo mensal — o mês que fecha (DEC-212)", () => {
  it("a run das 00:00 de 1º de novembro fecha OUTUBRO", () => {
    // 2026-11-01T03:00Z é 00:00 de 01/11 em America/Sao_Paulo.
    expect(closingMonthOfInstant(new Date("2026-11-01T03:00:00.000Z"))).toBe("2026-10");
  });

  it("uma run um segundo antes (ainda 31/10) fecha SETEMBRO: o mês é do dia civil, não do número", () => {
    // 2026-10-31T02:59:59Z é 23:59:59 de 31/10 SP — outubro ainda não fechou.
    expect(closingMonthOfInstant(new Date("2026-10-31T02:59:59.000Z"))).toBe("2026-09");
    expect(closingMonthOfInstant(new Date("2026-10-31T03:00:00.000Z"))).toBe("2026-09");
  });

  it("a virada de ano não vira mês 0 nem mês 13", () => {
    expect(closingMonthOfInstant(new Date("2027-01-01T03:00:00.000Z"))).toBe("2026-12");
  });
});

describe("ciclo mensal — a janela do mês", () => {
  it("meia-noite do mês é 03:00 UTC, e a janela é [início, início do mês seguinte)", () => {
    const { start, endExclusive } = monthWindow("2026-10");
    expect(start.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });

  it("conclusão às 23:59:59 do último dia está DENTRO; meia-noite do dia 1 está FORA", () => {
    const { start, endExclusive } = monthWindow("2026-10");
    const dentro = new Date("2026-10-31T23:59:59.000Z"); // 20:59:59 de 31/10 SP
    const limInf = new Date("2026-10-01T02:59:59.999Z"); // 23:59:59 de 30/09 SP — pertence a setembro
    const limSup = endExclusive; // 00:00 de 01/11 SP

    expect(dentro >= start && dentro < endExclusive).toBe(true);
    expect(limInf >= start).toBe(false);
    expect(limSup < endExclusive).toBe(false);
  });

  it("o mês de fevereiro de um ano bissexto fecha em 29 dias (a janela não hardcodora 30/31)", () => {
    const { start, endExclusive } = monthWindow("2028-02");
    expect(start.toISOString()).toBe("2028-02-01T03:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2028-03-01T03:00:00.000Z");
    const ultimoDia = new Date("2028-02-29T12:00:00.000Z");
    expect(ultimoDia >= start && ultimoDia < endExclusive).toBe(true);
  });

  it("`monthWindow` recusa grafia que não é YYYY-MM nomeando o valor", () => {
    expect(() => monthWindow("2026-1")).toThrow(/mês inválido: 2026-1/);
    expect(() => monthWindow("out/2026")).toThrow(/mês inválido/);
    expect(MONTH_KEY_PATTERN.test("2026-10")).toBe(true);
  });
});

describe("ciclo mensal — quem ganha snapshot e o que a coluna recebe", () => {
  it("saldo zero e nenhuma atividade no mês: sem linha (a coluna já está em 0)", () => {
    expect(shouldSnapshotClosedMonth({ points: 0, completedTasksOfMonth: 0 })).toBe(false);
  });

  it("saldo negativo entra no snapshot: o histórico guarda a dívida que o mês perdoou (DEC-39)", () => {
    expect(shouldSnapshotClosedMonth({ points: -37140, completedTasksOfMonth: 0 })).toBe(true);
  });

  it("atividade no mês sem saldo também entra (ranking mensal coerente)", () => {
    expect(shouldSnapshotClosedMonth({ points: 0, completedTasksOfMonth: 3 })).toBe(true);
  });

  it("a coluna SEMPRE recebe 0 no fechamento — o valor fotografado é o do snapshot", () => {
    expect(POINTS_AFTER_MONTH_CLOSE).toBe(0);
  });
});
