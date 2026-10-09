/**
 * OND8-B2 — testes das regras puras do store (backend/domain/store/store-rules.ts).
 * Mensagens legadas verbatim (contrato do contract test OND8-B3).
 */
import { describe, expect, it } from "vitest";

import { ConflictError, NotFoundError, ValidationError } from "@/backend/domain";

import {
  assertApprovedForComplete,
  assertNotCompletedForCancel,
  assertPendingForApprove,
  assertPendingForReject,
  assertPurchaseEligibility,
  buildPurchaseSnapshot,
  computeRewardPatchFields,
  computeRewardUpdateFields,
  normalizeRewardCreate,
  parsePurchaseRequest,
  shouldRefundOnCancel,
  shouldRefundOnReject,
} from "@/backend/domain";
import type { IReward } from "@/backend/domain";

const reward = (overrides: Partial<IReward> = {}): IReward => ({
  id: 1,
  name: "Kit",
  description: null,
  price: 10,
  available: true,
  ...overrides,
});

describe("normalizeRewardCreate", () => {
  it("validações legadas verbatim; available default true; description null", () => {
    expect(normalizeRewardCreate({ name: " Kit ", price: 0 })).toEqual({
      name: "Kit",
      description: null,
      price: 0,
      available: true,
    });
    expect(normalizeRewardCreate({ name: "k", price: 1, available: false, description: "d" })).toMatchObject({
      available: false,
      description: "d",
    });

    expect(() => normalizeRewardCreate({ name: "  ", price: 5 })).toThrow(ValidationError);
    expect(() => normalizeRewardCreate({ name: "  ", price: 5 })).toThrow("Nome da recompensa é obrigatório");
    expect(() => normalizeRewardCreate({ price: 5 })).toThrow("Nome da recompensa é obrigatório");
    expect(() => normalizeRewardCreate({ name: "ok", price: NaN })).toThrow("Preço deve ser um número não negativo");
    expect(() => normalizeRewardCreate({ name: "ok", price: -1 })).toThrow("Preço deve ser um número não negativo");
    expect(() => normalizeRewardCreate({ name: "ok", price: "abc" })).toThrow("Preço deve ser um número não negativo");
  });
});

describe("computeRewardUpdateFields", () => {
  it("merge parcial na ordem name -> description -> price -> available", () => {
    expect(computeRewardUpdateFields({})).toEqual({});
    expect(computeRewardUpdateFields({ description: "" })).toEqual({ description: null });
    expect(computeRewardUpdateFields({ available: 0 })).toEqual({ available: false });
    expect(computeRewardUpdateFields({ name: " novo ", price: 3 })).toEqual({ name: "novo", price: 3 });

    expect(() => computeRewardUpdateFields({ name: " " })).toThrow("Nome da recompensa é obrigatório");
    expect(() => computeRewardUpdateFields({ price: -2 })).toThrow("Preço deve ser um número não negativo");
  });
});

describe("computeRewardPatchFields", () => {
  it("actions nomeadas", () => {
    expect(computeRewardPatchFields(reward({ available: true }), "toggle-availability", undefined)).toEqual({
      available: false,
    });
    expect(computeRewardPatchFields(reward(), "update-price", { price: 5 })).toEqual({ price: 5 });
    expect(computeRewardPatchFields(reward(), "update-name", { name: " Novo " })).toEqual({ name: "Novo" });
    expect(computeRewardPatchFields(reward({ description: "d" }), "update-description", {})).toEqual({
      description: null,
    });
    expect(computeRewardPatchFields(reward(), "update-description", { description: "x" })).toEqual({
      description: "x",
    });

    expect(() => computeRewardPatchFields(reward(), "update-price", {})).toThrow("Preço deve ser um número não negativo");
    expect(() => computeRewardPatchFields(reward(), "update-name", {})).toThrow("Nome da recompensa é obrigatório");
  });

  it("QUIRK-8S8: action desconhecida/ausente aplica updateData (branch default)", () => {
    expect(computeRewardPatchFields(reward(), undefined, { price: 7, available: false })).toEqual({
      price: 7,
      available: false,
    });
    expect(computeRewardPatchFields(reward(), "zap", { name: "n" })).toEqual({ name: "n" });
    expect(computeRewardPatchFields(reward(), "zap", undefined)).toEqual({});
  });
});

describe("parsePurchaseRequest", () => {
  it("Number + Number.isInteger; QUIRK: 0 passa do check", () => {
    expect(parsePurchaseRequest({ userId: "3", rewardId: 4 })).toEqual({ userId: 3, rewardId: 4 });
    expect(parsePurchaseRequest({ userId: 0, rewardId: 0 })).toEqual({ userId: 0, rewardId: 0 });
    expect(() => parsePurchaseRequest({ userId: "abc", rewardId: 1 })).toThrow("userId e rewardId são obrigatórios");
    expect(() => parsePurchaseRequest({ userId: 1.5, rewardId: 1 })).toThrow("userId e rewardId são obrigatórios");
    expect(() => parsePurchaseRequest({})).toThrow("userId e rewardId são obrigatórios");
  });
});

describe("assertPurchaseEligibility (ordem legada)", () => {
  it("usuário -> recompensa -> available -> stock -> points", () => {
    expect(() => assertPurchaseEligibility(null, reward())).toThrow(NotFoundError);
    expect(() => assertPurchaseEligibility(null, reward())).toThrow("Usuário não encontrado");
    expect(() => assertPurchaseEligibility({ points: 100 }, null)).toThrow("Recompensa não encontrada");
    expect(() => assertPurchaseEligibility({ points: 100 }, reward({ available: false }))).toThrow(
      "Esta recompensa não está disponível",
    );
    expect(() => assertPurchaseEligibility({ points: 5 }, reward({ price: 10 }))).toThrow(
      "Pontos insuficientes. Você tem 5 pontos, mas precisa de 10 pontos",
    );
    expect(() => assertPurchaseEligibility({ points: 10 }, reward({ price: 10 }))).not.toThrow();
  });

  it("QUIRK-8S2: stock fantasma — branch 'fora de estoque' só dispara com stock > 0 explícito (inatingível em prod)", () => {
    expect(() => assertPurchaseEligibility({ points: 100 }, reward({ stock: null }))).not.toThrow();
    expect(() => assertPurchaseEligibility({ points: 100 }, reward({ stock: undefined }))).not.toThrow();
    expect(() => assertPurchaseEligibility({ points: 100 }, reward({ stock: 0 }))).toThrow(
      "Esta recompensa está fora de estoque",
    );
  });
});

describe("buildPurchaseSnapshot", () => {
  it("congelar rewardName/price no momento da compra; status pending", () => {
    const now = new Date("2026-09-16T12:00:00.000Z");
    expect(buildPurchaseSnapshot(7, reward({ name: "Kit", price: 30 }), now)).toEqual({
      userId: 7,
      rewardId: 1,
      rewardName: "Kit",
      price: 30,
      purchaseDate: now,
      status: "pending",
    });
  });
});

describe("transições de status (QUIRK-8S5)", () => {
  it("approve/reject exigem pending; complete exige approved; completed não cancela", () => {
    expect(() => assertPendingForApprove("approved")).toThrow(ConflictError);
    expect(() => assertPendingForApprove("approved")).toThrow("Apenas compras pendentes podem ser aprovadas");
    expect(() => assertPendingForReject("rejected")).toThrow("Apenas compras pendentes podem ser rejeitadas");
    expect(() => assertApprovedForComplete("pending")).toThrow("Apenas compras aprovadas podem ser completadas");
    expect(() => assertNotCompletedForCancel("completed")).toThrow("Compras completadas não podem ser canceladas");
    expect(() => assertPendingForApprove("pending")).not.toThrow();
  });

  it("reject SEMPRE reembolsa (tautologia pinada); cancel reembolsa pending/approved apenas", () => {
    expect(shouldRefundOnReject("pending")).toBe(true);
    expect(shouldRefundOnCancel("pending")).toBe(true);
    expect(shouldRefundOnCancel("approved")).toBe(true);
    expect(shouldRefundOnCancel("rejected")).toBe(false);
    expect(shouldRefundOnCancel("cancelled")).toBe(false);
  });
});
