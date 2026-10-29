/**
 * V5-2c (DEC-61/63) — entregáveis e anexos do projeto, congelados ANTES do código.
 *
 * O que esta guarda segura:
 *   - Entregável é `(nome, quantidade)`: nome obrigatório com o mesmo teto do nome de
 *     projeto, quantidade inteira ≥ 1 com default 1. Nada de quantidade 0 ou fracionária —
 *     ela entra em contagem de entrega.
 *   - A chave do anexo nasce de um prefixo derivado do id do projeto (`projects/<id>/
 *     attachments`), e id inválido não produz prefixo (o seam `sanitizeBlobPrefix` já recusa
 *     traversal; aqui é o outro lado: ninguém monta `projects/0/...`).
 *   - Metadado de anexo: nome e tamanho. O **tipo** e os **magic bytes** são do seam
 *     (`lib/storage/blob-store.ts`) — validar as duas coisas em dois lugares é a receita da
 *     regra divergir (lição DEC-90).
 */
import { describe, expect, it } from "vitest";

import {
  DELIVERABLE_MAX_QUANTITY,
  DELIVERABLE_NAME_MAX_LENGTH,
  PROJECT_IMAGE_SLOTS,
  isProjectImageSlot,
  normalizeDeliverableInput,
  projectAttachmentPrefix,
  projectImagePrefix,
  validateDeliverableInput,
  validateProjectAttachmentMetadata,
} from "@/backend/domain";

describe("entregável do projeto — nome e quantidade (V5-2c)", () => {
  it("nome aparado e quantidade ausente vira 1", () => {
    expect(normalizeDeliverableInput({ name: "  Relatório parcial  " })).toEqual({
      name: "Relatório parcial",
      quantity: 1,
    });
    expect(normalizeDeliverableInput({ name: "Slides", quantity: null })).toEqual({
      name: "Slides",
      quantity: 1,
    });
    expect(normalizeDeliverableInput({ name: "Slides", quantity: "" })).toEqual({
      name: "Slides",
      quantity: 1,
    });
  });

  it("quantidade numérica é aparada para inteiro (o form manda string)", () => {
    expect(normalizeDeliverableInput({ name: "Artigo", quantity: "3" }).quantity).toBe(3);
    expect(normalizeDeliverableInput({ name: "Artigo", quantity: 2.7 }).quantity).toBe(2);
  });

  it("quantidade sem leitura vira NaN para a validação recusar, não 1", () => {
    // Default 1 é para "não informei". "informei lixo" tem que ser recusado nomeando o campo.
    expect(normalizeDeliverableInput({ name: "Artigo", quantity: "muitas" }).quantity).toBeNaN();
    expect(validateDeliverableInput({ name: "Artigo", quantity: NaN })).toContain(
      "Quantidade do entregável deve ser um inteiro maior que zero",
    );
  });

  it("nome vazio é recusado", () => {
    expect(validateDeliverableInput({ name: "   ", quantity: 1 })).toContain(
      "Nome do entregável é obrigatório",
    );
  });

  it("nome tem o mesmo teto do nome de projeto (100)", () => {
    expect(DELIVERABLE_NAME_MAX_LENGTH).toBe(100);
    expect(
      validateDeliverableInput({ name: "x".repeat(DELIVERABLE_NAME_MAX_LENGTH + 1), quantity: 1 }),
    ).toContain("Nome do entregável não pode ter mais de 100 caracteres");
  });

  it("quantidade tem teto (999) e zero/negativo é recusado", () => {
    expect(DELIVERABLE_MAX_QUANTITY).toBe(999);
    expect(validateDeliverableInput({ name: "X", quantity: 0 })).toContain(
      "Quantidade do entregável deve ser um inteiro maior que zero",
    );
    expect(validateDeliverableInput({ name: "X", quantity: -4 })).toContain(
      "Quantidade do entregável deve ser um inteiro maior que zero",
    );
    expect(validateDeliverableInput({ name: "X", quantity: DELIVERABLE_MAX_QUANTITY + 1 })).toContain(
      "Quantidade do entregável não pode passar de 999",
    );
  });

  it("entregável válido não gera erro", () => {
    expect(validateDeliverableInput({ name: "Relatório final", quantity: 2 })).toEqual([]);
  });
});

describe("anexo do projeto — prefixo da chave e metadado (V5-2c)", () => {
  it("prefixo derivado do id do projeto", () => {
    expect(projectAttachmentPrefix(12)).toBe("projects/12/attachments");
  });

  it("id inválido não produz prefixo", () => {
    for (const bad of [0, -1, Number.NaN, 1.5, "12" as unknown as number]) {
      expect(() => projectAttachmentPrefix(bad)).toThrow(/projeto inválido/);
    }
  });

  it("nome e tamanho presentes passam", () => {
    expect(
      validateProjectAttachmentMetadata({ name: "foto do evento.png", size: 20480 }),
    ).toEqual([]);
  });

  it("nome ausente e tamanho zero são recusados", () => {
    const errors = validateProjectAttachmentMetadata({ name: "   ", size: 0 });
    expect(errors).toContain("Nome do anexo é obrigatório");
    expect(errors).toContain("Anexo sem conteúdo");
  });

  it("nome tem teto de 255 caracteres", () => {
    expect(
      validateProjectAttachmentMetadata({ name: "x".repeat(256), size: 10 }),
    ).toContain("Nome do anexo não pode ter mais de 255 caracteres");
  });
});

describe("imagem do projeto — slot e prefixo (V5-2d)", () => {
  it("slot é lista fechada: logo e banner, nada além", () => {
    expect(PROJECT_IMAGE_SLOTS).toEqual(["logo", "banner"]);
    expect(isProjectImageSlot("logo")).toBe(true);
    expect(isProjectImageSlot("banner")).toBe(true);
    // "capa" é a palavra que um chamador criativo escreveria. O slot entra na chave do bucket,
    // então aceita-lo cru deixaria a chave de dizer o que é.
    expect(isProjectImageSlot("capa")).toBe(false);
    expect(isProjectImageSlot("LOGO")).toBe(false);
    expect(isProjectImageSlot(undefined)).toBe(false);
  });

  it("prefixo carrega o projeto e o slot", () => {
    expect(projectImagePrefix(7, "logo")).toBe("projects/7/images/logo");
    expect(projectImagePrefix(7, "banner")).toBe("projects/7/images/banner");
  });

  it("id inválido não produz prefixo", () => {
    for (const bad of [0, -1, Number.NaN, 1.5, "12" as unknown as number]) {
      expect(() => projectImagePrefix(bad, "logo")).toThrow(/projeto inválido/);
    }
  });
});
