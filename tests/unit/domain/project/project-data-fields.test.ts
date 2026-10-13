/**
 * V5-2b (DEC-61/DEC-63) — campos de dados do projeto, congelados ANTES do código.
 *
 * O que esta guarda segura:
 *   - `startDate`/`endDate` são data civil `YYYY-MM-DD` (mesma decisão de `tasks.dueDate`,
 *     que é `String?` no schema): a aritmética do plano (V5-11, V5-5) é de dias civis em
 *     America/Sao_Paulo, e `backend/domain/time/civil-day.ts` já é a peça que resolve o
 *     fuso. Guardar ISO cru reabre o erro que o plan-v3 fechou (meia-noite UTC virando o
 *     dia anterior).
 *   - `points` é lido pela UI e **escrito só por use case de economia** (DEC-63/74, regra 6
 *     do plano): nenhum `UPDATE` direto de UI. `applyProjectUpdate` ignora o campo.
 *   - edital/processo são texto livre com teto de comprimento, no mesmo padrão do nome.
 */
import { describe, expect, it } from "vitest";

import {
  applyProjectUpdate,
  normalizeProjectDateField,
  projectValidationMessage,
  validateProjectInput,
  type ProjectRecordLike,
} from "@/backend/domain";

const baseRecord: ProjectRecordLike = {
  id: 1,
  name: "Projeto",
  description: null,
  createdAt: "2026-10-01T12:00:00.000Z",
  createdBy: 7,
  leaderId: null,
  status: "active",
  links: null,
};

describe("normalizeProjectDateField — data civil do projeto (V5-2b)", () => {
  it("ausente, null e string vazia viram null", () => {
    expect(normalizeProjectDateField(undefined)).toBeNull();
    expect(normalizeProjectDateField(null)).toBeNull();
    expect(normalizeProjectDateField("")).toBeNull();
    expect(normalizeProjectDateField("   ")).toBeNull();
  });

  it("YYYY-MM-DD passa tal e qual (o que o <input type=\"date\"> envia)", () => {
    expect(normalizeProjectDateField("2026-10-13")).toBe("2026-10-13");
    expect(normalizeProjectDateField(" 2026-10-13 ")).toBe("2026-10-13");
  });

  it("instantâneo ISO vira o dia civil de America/Sao_Paulo, não o dia UTC", () => {
    // 13/10 21:00 UTC é 13/10 18:00 em São Paulo.
    expect(normalizeProjectDateField("2026-10-13T21:00:00.000Z")).toBe("2026-10-13");
    // 14/10 02:00 UTC ainda é 13/10 23:00 em São Paulo — é aqui que o ISO cru mentiria.
    expect(normalizeProjectDateField("2026-10-14T02:00:00.000Z")).toBe("2026-10-13");
  });

  it("data inexistente (29 de fevereiro em ano não bissexto) não é normalizada", () => {
    // Mantém o texto cru para a validação recusar nomeando o campo, em vez de virar null
    // (null significaria "sem data", que é um estado legítimo e diferente).
    expect(normalizeProjectDateField("2026-02-29")).toBe("2026-02-29");
    expect(normalizeProjectDateField("não é data")).toBe("não é data");
  });
});

describe("validateProjectInput — campos novos do projeto (V5-2b)", () => {
  it("aceita período, edital e processo válidos", () => {
    const errors = validateProjectInput({
      ...baseRecord,
      startDate: "2026-02-01",
      endDate: "2026-12-20",
      editalNumber: "EDITAL 12/2026",
      processNumber: "IFNMG-2026/0042",
    });
    expect(errors).toEqual([]);
  });

  it("recusa data inválida nomeando qual lado é", () => {
    expect(
      validateProjectInput({ ...baseRecord, startDate: "2026-02-29" }).some((e) =>
        e.includes("início"),
      ),
    ).toBe(true);
    expect(
      validateProjectInput({ ...baseRecord, endDate: "13/10/2026" }).some((e) =>
        e.includes("término"),
      ),
    ).toBe(true);
  });

  it("recusa término anterior ao início", () => {
    const errors = validateProjectInput({
      ...baseRecord,
      startDate: "2026-12-20",
      endDate: "2026-02-01",
    });
    expect(errors).toContain("Data de término do projeto não pode ser anterior à data de início");
  });

  it("início igual ao término é válido (atividade de um dia)", () => {
    expect(
      validateProjectInput({ ...baseRecord, startDate: "2026-10-13", endDate: "2026-10-13" }),
    ).toEqual([]);
  });

  it("sem período não muda nada (colunas são nullable, migration sem backfill)", () => {
    expect(validateProjectInput({ ...baseRecord })).toEqual([]);
  });

  it("edital e processo têm teto de 100 caracteres, como o nome", () => {
    const long = "x".repeat(101);
    const errors = validateProjectInput({ ...baseRecord, editalNumber: long, processNumber: long });
    expect(errors).toContain("Número de edital do projeto não pode ter mais de 100 caracteres");
    expect(errors).toContain("Número de processo do projeto não pode ter mais de 100 caracteres");
  });

  it("a mensagem de rejeição continua `Dados inválidos: ...` (quirk congelado)", () => {
    expect(projectValidationMessage(["Data de início do projeto inválida"])).toBe(
      "Dados inválidos: Data de início do projeto inválida",
    );
  });
});

describe("applyProjectUpdate — escrita dos campos novos (V5-2b)", () => {
  it("grava período, edital e processo normalizados", () => {
    const next = applyProjectUpdate(baseRecord, {
      startDate: "2026-02-01",
      endDate: "2026-10-14T02:00:00.000Z", // dia civil 13/10 em São Paulo
      editalNumber: "EDITAL 12/2026",
      processNumber: "IFNMG-2026/0042",
    });
    expect(next.startDate).toBe("2026-02-01");
    expect(next.endDate).toBe("2026-10-13");
    expect(next.editalNumber).toBe("EDITAL 12/2026");
    expect(next.processNumber).toBe("IFNMG-2026/0042");
  });

  it("string vazia limpa o campo (null), como a descrição", () => {
    const filled = applyProjectUpdate(baseRecord, { startDate: "2026-02-01" });
    const cleared = applyProjectUpdate(filled, { startDate: "" });
    expect(filled.startDate).toBe("2026-02-01");
    expect(cleared.startDate).toBeNull();
  });

  it("campo ausente no corpo não é tocado", () => {
    const filled = applyProjectUpdate(baseRecord, { editalNumber: "E-1" });
    const untouched = applyProjectUpdate(filled, { name: "Outro nome" });
    expect(untouched.editalNumber).toBe("E-1");
    expect(untouched.startDate).toBeUndefined();
  });

  it("`points` NÃO é escrevível por update (regra 6 do plano: nenhum UPDATE direto de UI)", () => {
    const next = applyProjectUpdate({ ...baseRecord, points: 300 }, { points: 99999 });
    expect(next.points).toBe(300);
  });
});
