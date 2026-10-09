// @vitest-environment node
/**
 * plan-v3 · batch 1.B — `backend/domain/time/civil-day.ts`.
 *
 * A peça inteira depende de uma ideia só: um instante UTC pertence a um dia de calendário do
 * laboratório, e esse dia **não** é o dia UTC. Em America/Sao_Paulo (UTC-3 fixo) a meia-noite
 * UTC ainda é o dia anterior. É exatamente o que a aritmética pré-v3 ignorava.
 */
import { describe, expect, it } from "vitest";

import { civilDayOfDate, civilDayOfInstant, civilDaysBetween } from "@/backend/domain";

describe("civilDayOfInstant — o dia civil do laboratório, não o dia UTC", () => {
  it("meia-noite UTC ainda é o dia anterior em Brasília", () => {
    expect(civilDayOfInstant(new Date("2026-06-15T00:00:00.000Z"))).toBe("2026-06-14");
    expect(civilDayOfInstant(new Date("2026-06-15T02:59:59.999Z"))).toBe("2026-06-14");
  });

  it("a meia-noite de Brasília é a primeira instância do dia", () => {
    expect(civilDayOfInstant(new Date("2026-06-15T03:00:00.000Z"))).toBe("2026-06-15");
    expect(civilDayOfInstant(new Date("2026-06-15T23:59:59.999Z"))).toBe("2026-06-15");
  });

  it("vira o mês e o ano na hora certa (21h de Brasília do dia 31)", () => {
    expect(civilDayOfInstant(new Date("2026-12-31T21:00:00.000Z"))).toBe("2026-12-31");
    expect(civilDayOfInstant(new Date("2027-01-01T00:00:00.000Z"))).toBe("2026-12-31");
    expect(civilDayOfInstant(new Date("2027-01-01T03:00:00.000Z"))).toBe("2027-01-01");
  });
});

describe("civilDayOfDate — aceita as duas formas que existem no banco", () => {
  it("date-only cru NÃO é deslocado: é o dia que a pessoa escolheu no formulário", () => {
    expect(civilDayOfDate("2026-06-15")).toBe("2026-06-15");
    expect(civilDayOfDate("2025-01-21")).toBe("2025-01-21");
  });

  it("ISO com hora é convertido para o dia civil do laboratório", () => {
    expect(civilDayOfDate("2026-06-15T02:00:00.000Z")).toBe("2026-06-14");
    expect(civilDayOfDate("2026-06-15T03:00:00.000Z")).toBe("2026-06-15");
    expect(civilDayOfDate("2026-06-15T12:00:00.000Z")).toBe("2026-06-15");
  });

  it("valor ilegível devolve null — quem chama decide se isso significa 'sem prazo'", () => {
    expect(civilDayOfDate("sem prazo")).toBeNull();
    expect(civilDayOfDate("")).toBeNull();
    expect(civilDayOfDate("2026-13-45")).toBeNull();
  });
});

describe("civilDaysBetween — dias inteiros, com sinal", () => {
  it("mesmo dia é zero, e a ordem define o sinal", () => {
    expect(civilDaysBetween("2026-06-15", "2026-06-15")).toBe(0);
    expect(civilDaysBetween("2026-06-15", "2026-06-16")).toBe(1);
    expect(civilDaysBetween("2026-06-16", "2026-06-15")).toBe(-1);
  });

  it("cruza mês e ano sem fração", () => {
    expect(civilDaysBetween("2026-06-30", "2026-07-01")).toBe(1);
    expect(civilDaysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(civilDaysBetween("2025-01-21", "2026-10-02")).toBe(619);
  });

  it("respeita ano bissexto", () => {
    expect(civilDaysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(civilDaysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
});
