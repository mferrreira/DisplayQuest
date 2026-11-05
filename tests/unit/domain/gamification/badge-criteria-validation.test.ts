/**
 * plan-v15 S02 (MODELO R3/R6) — validação estrita de criteria na escrita de badge.
 *
 * O que este arquivo trava:
 *  - criteria nulo/ausente é aceito (badge de concessão manual; engine nunca concede);
 *  - criteria v2 válido passa normalizado;
 *  - criteria no formato legado (keys de 2026) é recusado na escrita (R6);
 *  - métrica fora do registro, op != `>=`, valor < 1, clauses vazio, version != 2:
 *    ValidationError "Critério de badge inválido".
 */
import { describe, expect, it } from "vitest";

import { ValidationError } from "@/backend/domain/errors/DomainError";
import { validateBadgeCriteriaInput } from "@/backend/domain";

describe("validateBadgeCriteriaInput", () => {
  it("criteria ausente ou nulo é aceito como null", () => {
    expect(validateBadgeCriteriaInput(undefined)).toBeNull();
    expect(validateBadgeCriteriaInput(null)).toBeNull();
  });

  it("criteria v2 válido passa normalizado", () => {
    const criteria = validateBadgeCriteriaInput({
      version: 2,
      clauses: [{ metric: "tasks_completed", op: ">=", value: 10 }],
    });
    expect(criteria).toEqual({ version: 2, clauses: [{ metric: "tasks_completed", op: ">=", value: 10 }] });
  });

  it("formato legado de 2026 é recusado na escrita (R6)", () => {
    expect(() => validateBadgeCriteriaInput({ points: 10 })).toThrow(ValidationError);
    expect(() => validateBadgeCriteriaInput({ specialCondition: "coordenador" })).toThrow("Critério de badge inválido");
  });

  it("métrica fora do registro é recusada", () => {
    expect(() =>
      validateBadgeCriteriaInput({ version: 2, clauses: [{ metric: "coordenador", op: ">=", value: 1 }] }),
    ).toThrow("Critério de badge inválido");
  });

  it("op != >= é recusado", () => {
    expect(() =>
      validateBadgeCriteriaInput({ version: 2, clauses: [{ metric: "points", op: ">", value: 5 }] }),
    ).toThrow("Critério de badge inválido");
  });

  it("valor < 1 é recusado", () => {
    expect(() =>
      validateBadgeCriteriaInput({ version: 2, clauses: [{ metric: "points", op: ">=", value: 0 }] }),
    ).toThrow("Critério de badge inválido");
    expect(() =>
      validateBadgeCriteriaInput({ version: 2, clauses: [{ metric: "points", op: ">=", value: -3 }] }),
    ).toThrow("Critério de badge inválido");
  });

  it("clauses vazio é recusado na escrita", () => {
    expect(() => validateBadgeCriteriaInput({ version: 2, clauses: [] })).toThrow("Critério de badge inválido");
  });

  it("version != 2 é recusado", () => {
    expect(() => validateBadgeCriteriaInput({ version: 1, clauses: [{ metric: "points", op: ">=", value: 2 }] })).toThrow(
      "Critério de badge inválido",
    );
    expect(() => validateBadgeCriteriaInput({ clauses: [{ metric: "points", op: ">=", value: 2 }] })).toThrow(
      "Critério de badge inválido",
    );
  });

  it("valor fracionário >= 1 é aceito (weekly_hours_avg é horas)", () => {
    expect(
      validateBadgeCriteriaInput({ version: 2, clauses: [{ metric: "weekly_hours_avg", op: ">=", value: 8.5 }] }),
    ).toEqual({ version: 2, clauses: [{ metric: "weekly_hours_avg", op: ">=", value: 8.5 }] });
  });
});
