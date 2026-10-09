/**
 * B6-2d (D4) — o contrato HTTP das 2 rotas de purchases depois que a autoridade desceu para
 * os use cases. O foco deste arquivo é `/api/purchases/[id]` (os 4 métodos nunca tiveram teste
 * de autorização — a caraterização do B6-0 cobriu só `/api/purchases`); a lista está pinada
 * na caraterização e não é duplicada aqui.
 *
 * Molde da casa (B6-2a/2b/2c): módulo REAL (`createStoreModule`) sobre portas falsas, só
 * `requireAuth` dobrado — `requireApiActor`, `userActor`, a matriz de permissões e os use
 * cases são os de produção. Um duplo de módulo não faz o teste falhar, faz o 403 desaparecer.
 *
 * Ordens congeladas (todas medidas na rota legada antes do movimento):
 *  - GET [id]: 404 ANTES do 403 (a compra é lida primeiro; o dono decide depois). O 404 é o
 *    corpo legado {error} — GetPurchaseUseCase devolve null, a rota mapeia.
 *  - PUT: 403 ANTES do parse do corpo — por isso existe `assertCanManagePurchases` (mesmo
 *    padrão do AssertCanPublishNotificationEventUseCase, B6-2b): corpo inválido para quem não
 *    tem permissão é 403, não 500. E 403 antes de 404.
 *  - PATCH: 404 antes do gate; gate por AÇÃO (cancel self-or-manage; approve/reject/complete/
 *    merge MANAGE_PURCHASES puro, até para o dono); gate antes das asserções de status (409).
 *  - DELETE: 403 antes de 404.
 * Corpos: 403 de gate migrado = {error, code, details} (DEC-53); 404 do GET [id] = {error}
 * legado; 404 dos demais = NotFoundError mapeado (já era o comportamento B5 do mapper).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createStoreModule } from "@/backend/modules/store";
import type { PurchaseRepository } from "@/backend/modules/store/application/ports/purchase.repository";
import type { RewardRepository } from "@/backend/modules/store/application/ports/reward.repository";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  purchases: [] as Array<Record<string, unknown>>,
  writes: [] as string[],
  refunds: [] as Array<{ userId: number; price: number }>,
}));

vi.mock("@/backend/composition/root", () => {
  const purchases: PurchaseRepository = {
    async findById(id: number) {
      return (mocks.purchases.find((p) => p.id === id) as never) ?? null;
    },
    async findAll() {
      return mocks.purchases as never;
    },
    async findByUserId(userId: number) {
      return mocks.purchases.filter((p) => p.userId === userId) as never;
    },
    async findByStatus(status: string) {
      return mocks.purchases.filter((p) => p.status === status) as never;
    },
    async findByRewardId(rewardId: number) {
      return mocks.purchases.filter((p) => p.rewardId === rewardId) as never;
    },
    async findUserById(userId: number) {
      return (userId === 42 || userId === 77 ? { id: userId, name: `Usuário ${userId}`, points: 100 } : null) as never;
    },
    async createWithPointDeduction(snapshot: object) {
      mocks.writes.push(`create:${(snapshot as { userId: number }).userId}`);
      const created = { id: 90 + mocks.purchases.length, ...(snapshot as object) };
      mocks.purchases.push(created);
      return created as never;
    },
    async update(id: number, fields: object) {
      mocks.writes.push(`update:${id}`);
      const index = mocks.purchases.findIndex((p) => p.id === id);
      const next = { ...mocks.purchases[index], ...(fields as object) };
      mocks.purchases[index] = next;
      return next as never;
    },
    async delete(id: number) {
      mocks.writes.push(`delete:${id}`);
      mocks.purchases.splice(mocks.purchases.findIndex((p) => p.id === id), 1);
    },
    async refundPoints(userId: number, price: number) {
      mocks.refunds.push({ userId, price });
    },
  } as unknown as PurchaseRepository;

  const rewards: RewardRepository = {
    async findById(id) {
      if (id !== 1) return null;
      return {
        id: 1,
        name: "Kit",
        price: 30,
        available: true,
        stock: null,
        description: null,
        imageUrl: null,
        categoryId: null,
      } as never;
    },
    async findAll() {
      return [];
    },
    async create() {
      throw new Error("porta de rewards não deveria ser usada neste teste: create");
    },
    async update() {
      throw new Error("porta de rewards não deveria ser usada neste teste: update");
    },
    async delete() {
      throw new Error("porta de rewards não deveria ser usada neste teste: delete");
    },
  };

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      store: createStoreModule({ ports: { purchases, rewards } }),
    }),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { GET as purchaseGet, PATCH as purchasePatch, PUT as purchasePut, DELETE as purchaseDelete } from "@/app/api/purchases/[id]/route";

function login(roles: string[], id = 42) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function request(path: string, init?: { method?: string; body?: unknown; raw?: string }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    body: init?.raw !== undefined ? init.raw : init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const body = async (response: Response) => await response.json();

function seedPurchases() {
  const date = new Date("2026-10-01T12:00:00.000Z");
  mocks.purchases = [
    { id: 1, userId: 42, rewardId: 1, rewardName: "Kit", price: 30, status: "pending", purchaseDate: date },
    { id: 2, userId: 77, rewardId: 1, rewardName: "Kit", price: 30, status: "pending", purchaseDate: date },
    { id: 3, userId: 42, rewardId: 1, rewardName: "Kit", price: 30, status: "completed", purchaseDate: date },
  ];
}

describe("B6-2d — /api/purchases/[id] com a autoridade nos use cases", () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.writes = [];
    mocks.refunds = [];
    seedPurchases();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET — self-or-manage, 404 antes do 403", () => {
    it("dono lê a própria compra", async () => {
      login(["VOLUNTARIO"], 42);
      const response = await purchaseGet(request("/api/purchases/1"), params("1"));
      expect(response.status).toBe(200);
      expect((await body(response)).purchase).toMatchObject({ id: 1, userId: 42 });
    });

    it("outro sem permissão recebe 403 {error, code, details} (DEC-53)", async () => {
      login(["VOLUNTARIO"], 999);
      const response = await purchaseGet(request("/api/purchases/1"), params("1"));
      expect(response.status).toBe(403);
      expect(await body(response)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
    });

    it("LABORATORISTA (MANAGE_PURCHASES) lê compra alheia", async () => {
      login(["LABORATORISTA"], 999);
      const response = await purchaseGet(request("/api/purchases/1"), params("1"));
      expect(response.status).toBe(200);
    });

    it("compra inexistente: 404 com o corpo legado {error} preservado (null do use case)", async () => {
      login(["VOLUNTARIO"], 42);
      const response = await purchaseGet(request("/api/purchases/999999"), params("999999"));
      expect(response.status).toBe(404);
      expect(await body(response)).toEqual({ error: "Compra não encontrada" });
    });

    it("inexistente para quem também não teria acesso: 404 ANTES do 403 (ordem medida)", async () => {
      login(["VOLUNTARIO"], 999);
      const response = await purchaseGet(request("/api/purchases/999999"), params("999999"));
      expect(response.status).toBe(404);
    });

    it("sem sessão é 401", async () => {
      expect((await purchaseGet(request("/api/purchases/1"), params("1"))).status).toBe(401);
    });
  });

  describe("PUT — MANAGE_PURCHASES puro, 403 antes do parse do corpo e antes do 404", () => {
    it("VOLUNTARIO é barrado até para a própria compra (a rota legacy não tinha esse caminho)", async () => {
      login(["VOLUNTARIO"], 42);
      const response = await purchasePut(request("/api/purchases/1", { method: "PUT", body: { status: "x" } }), params("1"));
      expect(response.status).toBe(403);
      expect(await body(response)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
      expect(mocks.writes).toEqual([]);
    });

    it("corpo inválido para quem não tem permissão é 403, não 500 (assert antes do parse)", async () => {
      login(["VOLUNTARIO"], 42);
      const response = await purchasePut(request("/api/purchases/1", { method: "PUT", raw: "não é json" }), params("1"));
      expect(response.status).toBe(403);
    });

    it("403 antes de 404: compra inexistente para quem não pode é 403", async () => {
      login(["VOLUNTARIO"], 42);
      const response = await purchasePut(request("/api/purchases/999999", { method: "PUT", body: {} }), params("999999"));
      expect(response.status).toBe(403);
    });

    it("LABORATORISTA atualiza compra alheia", async () => {
      login(["LABORATORISTA"], 999);
      const response = await purchasePut(request("/api/purchases/1", { method: "PUT", body: { status: "approved" } }), params("1"));
      expect(response.status).toBe(200);
      expect((await body(response)).purchase).toMatchObject({ status: "approved" });
    });

    it("compra inexistente para quem PODE é 404 mapeado", async () => {
      login(["LABORATORISTA"], 999);
      const response = await purchasePut(request("/api/purchases/999999", { method: "PUT", body: {} }), params("999999"));
      expect(response.status).toBe(404);
      expect(await body(response)).toMatchObject({ error: "Compra não encontrada", code: "NOT_FOUND" });
    });
  });

  describe("PATCH — 404 primeiro, gate por AÇÃO, gate antes das asserções de status", () => {
    it("dono cancela a própria compra (self-or-manage) e o reembolso acontece", async () => {
      login(["VOLUNTARIO"], 42);
      const response = await purchasePatch(request("/api/purchases/1", { method: "PATCH", body: { action: "cancel" } }), params("1"));
      expect(response.status).toBe(200);
      expect((await body(response)).purchase).toMatchObject({ status: "cancelled" });
      expect(mocks.refunds).toEqual([{ userId: 42, price: 30 }]);
    });

    it("outro sem permissão não cancela compra alheia", async () => {
      login(["VOLUNTARIO"], 999);
      const response = await purchasePatch(request("/api/purchases/1", { method: "PATCH", body: { action: "cancel" } }), params("1"));
      expect(response.status).toBe(403);
      expect(mocks.writes).toEqual([]);
    });

    it("approve exige MANAGE_PURCHASES ATÉ PARA O DONO (regra medida na rota legacy)", async () => {
      login(["VOLUNTARIO"], 42);
      const response = await purchasePatch(request("/api/purchases/1", { method: "PATCH", body: { action: "approve" } }), params("1"));
      expect(response.status).toBe(403);
    });

    it("LABORATORISTA aprova compra alheia", async () => {
      login(["LABORATORISTA"], 999);
      const response = await purchasePatch(request("/api/purchases/2", { method: "PATCH", body: { action: "approve" } }), params("2"));
      expect(response.status).toBe(200);
      expect((await body(response)).purchase).toMatchObject({ status: "approved" });
    });

    it("404 ANTES do gate: inexistente para quem não pode é 404, não 403 (ordem medida)", async () => {
      login(["VOLUNTARIO"], 999);
      const response = await purchasePatch(request("/api/purchases/999999", { method: "PATCH", body: { action: "approve" } }), params("999999"));
      expect(response.status).toBe(404);
      expect(await body(response)).toMatchObject({ error: "Compra não encontrada", code: "NOT_FOUND" });
    });

    it("gate antes das asserções de status: dono cancelando compra CONCLUÍDA recebe 409, não 403", async () => {
      login(["VOLUNTARIO"], 42);
      const response = await purchasePatch(request("/api/purchases/3", { method: "PATCH", body: { action: "cancel" } }), params("3"));
      expect(response.status).toBe(409);
    });

    it("action desconhecida (merge) exige MANAGE_PURCHASES", async () => {
      login(["VOLUNTARIO"], 42);
      const response = await purchasePatch(request("/api/purchases/1", { method: "PATCH", body: { action: "fundar", status: "x" } }), params("1"));
      expect(response.status).toBe(403);
    });
  });

  describe("DELETE — MANAGE_PURCHASES puro, 403 antes de 404", () => {
    it("VOLUNTARIO é barrado até para a própria compra", async () => {
      login(["VOLUNTARIO"], 42);
      const response = await purchaseDelete(request("/api/purchases/1", { method: "DELETE" }), params("1"));
      expect(response.status).toBe(403);
      expect(mocks.writes).toEqual([]);
    });

    it("403 antes de 404", async () => {
      login(["VOLUNTARIO"], 42);
      const response = await purchaseDelete(request("/api/purchases/999999", { method: "DELETE" }), params("999999"));
      expect(response.status).toBe(403);
    });

    it("LABORATORISTA exclui e a compra sai da porta", async () => {
      login(["LABORATORISTA"], 999);
      const response = await purchaseDelete(request("/api/purchases/1", { method: "DELETE" }), params("1"));
      expect(response.status).toBe(200);
      expect(await body(response)).toEqual({ success: true });
      expect(mocks.purchases.some((p) => p.id === 1)).toBe(false);
    });

    it("inexistente para quem PODE é 404 mapeado", async () => {
      login(["LABORATORISTA"], 999);
      const response = await purchaseDelete(request("/api/purchases/999999", { method: "DELETE" }), params("999999"));
      expect(response.status).toBe(404);
      expect(await body(response)).toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
