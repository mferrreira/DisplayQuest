/**
 * B6-2d (D4) — os 6 use cases de compra passaram a EXIGIR ator, com o formato decidido por
 * medição (B6-RESTANTE §B6-2d e a caraterização do B6-0):
 *
 *  - createPurchase: gate CROSS-ACTOR — comprar PARA SI é sempre permitido (qualquer papel),
 *    comprar PARA OUTRO exige MANAGE_PURCHASES. É `requireActorSelfOrPermission` (DEC-115).
 *  - getPurchase: self-or-manage depois da leitura (444 antes do 403 — ordem medida na rota).
 *  - updatePurchase / deletePurchase: MANAGE_PURCHASES PURO, antes da leitura (403 antes de
 *    404 — ordem medida). Não existe "dono atualiza a própria compra": a rota legacy não tinha
 *    esse caminho, e o teste de caraterização congelou isso.
 *  - patchPurchase: 404 primeiro; gate por AÇÃO — cancel é self-or-manage, approve/reject/
 *    complete/merge exigem MANAGE_PURCHASES até para o dono.
 *  - listPurchases: a resolução de escopo A2 passou a receber o ActorRef em vez do veredito
 *    `canManagePurchases` que a rota calculava. O deny continua `{deny, message}` (corpo 403
 *    legado EXATO), não exceção.
 *
 * Congelado aqui: a mensagem "Acesso negado" (default de `ensurePermission`/`ForbiddenError`),
 * a ORDEM de cada método, e o fato de um 403/404 não tocar a porta. A negação por rota
 * (HTTP, corpo `{error, code, details}`) está em `purchases-authorization.test.ts` e na
 * caraterização. O bypass `system` é o declarado do DEC-54 (medido: nenhuma rotina chama
 * estes use cases; o ramo existe para o tipo do ator ser honesto) — fixado caso a caso.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  systemActor,
  userActor,
  ValidationError,
} from "@/backend/domain";
import { createStoreModule } from "@/backend/modules/store";
import type { StoreModule } from "@/backend/modules/store";
import type { PurchaseStatus } from "@/backend/domain";
import type { PurchaseRepository } from "@/backend/modules/store/application/ports/purchase.repository";
import type { RewardRepository } from "@/backend/modules/store/application/ports/reward.repository";

const MANAGER_ROLES = ["COORDENADOR"]; // MANAGE_PURCHASES na matriz real
const NO_MANAGEMENT_ROLES = ["VOLUNTARIO"];
const LEGACY_DENIED_MESSAGE = "Acesso negado";

const OWNER_ID = 42;
const OTHER_ID = 77;

interface FakePurchase {
  id: number;
  userId: number;
  rewardId: number;
  rewardName: string;
  price: number;
  status: PurchaseStatus;
  purchaseDate: Date;
}

function makePurchase(overrides: Partial<FakePurchase> = {}): FakePurchase {
  return {
    id: 1,
    userId: OWNER_ID,
    rewardId: 1,
    rewardName: "Kit",
    price: 30,
    status: "pending",
    purchaseDate: new Date("2026-10-01T12:00:00.000Z"),
    ...overrides,
  };
}

function makeFakes() {
  const purchasesDb: FakePurchase[] = [
    makePurchase({ id: 1, userId: OWNER_ID, status: "pending" }),
    makePurchase({ id: 2, userId: OTHER_ID, status: "pending" }),
    makePurchase({ id: 3, userId: OWNER_ID, status: "completed" }),
  ];
  const writes: string[] = [];
  const refunds: Array<{ userId: number; price: number }> = [];

  const purchases: PurchaseRepository = {
    async findById(id) {
      return purchasesDb.find((p) => p.id === id) ?? null;
    },
    async findAll() {
      return [...purchasesDb];
    },
    async findByUserId(userId) {
      return purchasesDb.filter((p) => p.userId === userId);
    },
    async findByStatus(status) {
      return purchasesDb.filter((p) => p.status === status);
    },
    async findByRewardId(rewardId) {
      return purchasesDb.filter((p) => p.rewardId === rewardId);
    },
    async findUserById(userId) {
      return userId === OWNER_ID || userId === OTHER_ID ? { id: userId, name: `Usuário ${userId}`, points: 100 } : null;
    },
    async createWithPointDeduction(snapshot) {
      writes.push(`create:${(snapshot as { userId: number }).userId}`);
      const created = makePurchase({ id: 90 + purchasesDb.length, ...(snapshot as object) });
      purchasesDb.push(created);
      return created;
    },
    async update(id, fields) {
      writes.push(`update:${id}`);
      const index = purchasesDb.findIndex((p) => p.id === id);
      const next = { ...purchasesDb[index], ...(fields as object) };
      purchasesDb[index] = next;
      return next;
    },
    async delete(id) {
      writes.push(`delete:${id}`);
      purchasesDb.splice(purchasesDb.findIndex((p) => p.id === id), 1);
    },
    async refundPoints(userId, price) {
      refunds.push({ userId, price });
    },
  };

  const rewards: RewardRepository = {
    async findById(id) {
      return id === 1 ? { id: 1, name: "Kit", price: 30, available: true, stock: null, description: null, imageUrl: null, categoryId: null } : null;
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

  const store: StoreModule = createStoreModule({ ports: { purchases, rewards } });
  return { store, purchasesDb, writes, refunds };
}

const buyer = userActor(OWNER_ID, NO_MANAGEMENT_ROLES);
const manager = userActor(OTHER_ID, MANAGER_ROLES);

describe("store — autorização de purchases no use case (B6-2d)", () => {
  let fakes: ReturnType<typeof makeFakes>;

  beforeEach(() => {
    fakes = makeFakes();
  });

  describe("createPurchase — gate cross-actor (comprar PARA OUTRO exige MANAGE_PURCHASES)", () => {
    it("VOLUNTARIO comprando PARA SI passa", async () => {
      const purchase = await fakes.store.createPurchase({ actor: buyer, data: { userId: OWNER_ID, rewardId: 1 } });
      expect(purchase).toMatchObject({ userId: OWNER_ID, rewardId: 1, status: "pending" });
      expect(fakes.writes).toEqual([`create:${OWNER_ID}`]);
    });

    it("VOLUNTARIO comprando PARA OUTRO recebe 403 com a mensagem legada", async () => {
      await expect(
        fakes.store.createPurchase({ actor: buyer, data: { userId: OTHER_ID, rewardId: 1 } }),
      ).rejects.toThrow(LEGACY_DENIED_MESSAGE);
      expect(fakes.writes).toEqual([]);
    });

    it("COORDENADOR compra para terceiro", async () => {
      const purchase = await fakes.store.createPurchase({ actor: manager, data: { userId: OWNER_ID, rewardId: 1 } });
      expect(purchase).toMatchObject({ userId: OWNER_ID });
    });

    it("o gate vem ANTES do parse do rewardId: rewardId inválido para terceiro é 403, não 400", async () => {
      await expect(
        fakes.store.createPurchase({ actor: buyer, data: { userId: OTHER_ID, rewardId: "abc" } }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("rewardId inválido PARA SI chega na validação (400), porque o gate não barra", async () => {
      await expect(
        fakes.store.createPurchase({ actor: buyer, data: { userId: OWNER_ID, rewardId: "abc" } }),
      ).rejects.toThrow(ValidationError);
    });

    it("gate vem antes dos 404: usuário inexistente PARA OUTRO é 403, não 404", async () => {
      await expect(
        fakes.store.createPurchase({ actor: buyer, data: { userId: 999999, rewardId: 1 } }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("roles sujos negam em vez de estourar", async () => {
      const dirty = userActor(OWNER_ID, undefined as never);
      await expect(
        fakes.store.createPurchase({ actor: dirty, data: { userId: OTHER_ID, rewardId: 1 } }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("getPurchase — self-or-manage, 404 antes do 403", () => {
    it("dono lê a própria compra", async () => {
      const purchase = await fakes.store.getPurchase(buyer, 1);
      expect(purchase).toMatchObject({ id: 1, userId: OWNER_ID });
    });

    it("outro sem permissão recebe 403", async () => {
      const stranger = userActor(999, NO_MANAGEMENT_ROLES);
      await expect(fakes.store.getPurchase(stranger, 1)).rejects.toThrow(LEGACY_DENIED_MESSAGE);
    });

    it("COORDENADOR lê compra alheia", async () => {
      const purchase = await fakes.store.getPurchase(manager, 1);
      expect(purchase).toMatchObject({ id: 1 });
    });

    it("compra inexistente devolve null ANTES de qualquer gate (404 legado preservado pela rota)", async () => {
      const stranger = userActor(999, NO_MANAGEMENT_ROLES);
      expect(await fakes.store.getPurchase(stranger, 999999)).toBeNull();
    });
  });

  describe("updatePurchase / deletePurchase — MANAGE_PURCHASES puro, 403 antes de 404", () => {
    it("VOLUNTARIO não atualiza nem a própria compra (a rota legacy não tinha esse caminho)", async () => {
      await expect(
        fakes.store.updatePurchase({ actor: buyer, purchaseId: 1, data: { status: "x" } }),
      ).rejects.toThrow(LEGACY_DENIED_MESSAGE);
      expect(fakes.writes).toEqual([]);
    });

    it("gate antes da leitura: compra inexistente para quem não pode é 403, não 404", async () => {
      await expect(
        fakes.store.updatePurchase({ actor: buyer, purchaseId: 999999, data: {} }),
      ).rejects.toThrow(ForbiddenError);
      await expect(fakes.store.deletePurchase({ actor: buyer, purchaseId: 999999 })).rejects.toThrow(ForbiddenError);
    });

    it("COORDENADOR atualiza (merge cego preservado) e exclui", async () => {
      const updated = await fakes.store.updatePurchase({ actor: manager, purchaseId: 1, data: { status: "qualquer-coisa" } });
      expect(updated.status).toBe("qualquer-coisa");
      await fakes.store.deletePurchase({ actor: manager, purchaseId: 2 });
      expect(fakes.purchasesDb.some((p) => p.id === 2)).toBe(false);
    });

    it("compra inexistente para quem PODE é 404", async () => {
      await expect(fakes.store.deletePurchase({ actor: manager, purchaseId: 999999 })).rejects.toThrow(NotFoundError);
    });
  });

  describe("patchPurchase — 404 primeiro; gate por AÇÃO", () => {
    it("dono cancela a própria compra (self-or-manage)", async () => {
      const cancelled = await fakes.store.patchPurchase({ actor: buyer, purchaseId: 1, action: "cancel" });
      expect(cancelled.status).toBe("cancelled");
      expect(fakes.refunds).toEqual([{ userId: OWNER_ID, price: 30 }]); // QUIRK-8S5 preservado
    });

    it("outro sem permissão não cancela compra alheia", async () => {
      const stranger = userActor(999, NO_MANAGEMENT_ROLES);
      await expect(fakes.store.patchPurchase({ actor: stranger, purchaseId: 1, action: "cancel" })).rejects.toThrow(
        LEGACY_DENIED_MESSAGE,
      );
      expect(fakes.writes).toEqual([]);
    });

    it("approve/reject/complete exigem MANAGE_PURCHASES ATÉ PARA O DONO (regra medida na rota legacy)", async () => {
      await expect(fakes.store.patchPurchase({ actor: buyer, purchaseId: 1, action: "approve" })).rejects.toThrow(
        LEGACY_DENIED_MESSAGE,
      );
      await expect(fakes.store.patchPurchase({ actor: buyer, purchaseId: 1, action: "reject" })).rejects.toThrow(
        ForbiddenError,
      );
      await expect(fakes.store.patchPurchase({ actor: buyer, purchaseId: 1, action: "complete" })).rejects.toThrow(
        ForbiddenError,
      );
    });

    it("action desconhecida (merge) também exige MANAGE_PURCHASES", async () => {
      await expect(
        // O tipo da action é estrito no contrato; pela HTTP chega qualquer string (o corpo é
        // `any`) e cai no merge cego — o `as never` simula exatamente esse caminho.
        fakes.store.patchPurchase({ actor: buyer, purchaseId: 1, action: "fundar" as never, updateData: { status: "x" } }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("404 vem ANTES do gate: compra inexistente para quem não pode é 404, não 403 (ordem medida)", async () => {
      const stranger = userActor(999, NO_MANAGEMENT_ROLES);
      await expect(fakes.store.patchPurchase({ actor: stranger, purchaseId: 999999, action: "approve" })).rejects.toThrow(
        NotFoundError,
      );
    });

    it("gate vem antes das asserções de status: dono cancelando compra concluída recebe 409, não 403", async () => {
      await expect(fakes.store.patchPurchase({ actor: buyer, purchaseId: 3, action: "cancel" })).rejects.toThrow(
        ConflictError,
      );
    });

    it("COORDENADOR aprova compra alheia", async () => {
      const approved = await fakes.store.patchPurchase({ actor: manager, purchaseId: 2, action: "approve" });
      expect(approved.status).toBe("approved");
    });
  });

  describe("listPurchases — escopo A2 decidido a partir do ActorRef (veredito da rota saiu)", () => {
    it("usuário comum sem filtro vê só as próprias compras", async () => {
      const result = await fakes.store.listPurchases({ actor: buyer });
      expect(result.denied).toBe(false);
      if (result.denied) throw new Error("não deveria negar");
      expect(result.purchases.map((p) => p.userId)).toEqual([OWNER_ID, OWNER_ID]);
    });

    it("usuário comum pedindo userId de outro recebe deny com a mensagem legada", async () => {
      const result = await fakes.store.listPurchases({ actor: buyer, userId: String(OTHER_ID) });
      expect(result).toMatchObject({ denied: true, message: LEGACY_DENIED_MESSAGE });
    });

    it("filtro global (status/rewardId/datas) sem MANAGE_PURCHASES recebe deny", async () => {
      expect(await fakes.store.listPurchases({ actor: buyer, status: "pending" })).toMatchObject({ denied: true });
      expect(await fakes.store.listPurchases({ actor: buyer, rewardId: "1" })).toMatchObject({ denied: true });
      expect(
        await fakes.store.listPurchases({
          actor: buyer,
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        }),
      ).toMatchObject({ denied: true });
    });

    it("COORDENADOR sem filtro vê todas; com userId de outro também", async () => {
      const all = await fakes.store.listPurchases({ actor: manager });
      expect(all.denied).toBe(false);
      if (all.denied) throw new Error("não deveria negar");
      expect(all.purchases.length).toBe(3);

      const other = await fakes.store.listPurchases({ actor: manager, userId: String(OWNER_ID) });
      expect(other.denied).toBe(false);
    });

    it("system actor passa pelo bypass declarado (DEC-54) — medido: nenhuma rotina chama este use case", async () => {
      const result = await fakes.store.listPurchases({ actor: systemActor("WEEKLY_RESET") });
      expect(result.denied).toBe(false);
    });
  });

  describe("assertCanManagePurchases — o assert que preserva o 403-antes-do-parse do PUT", () => {
    it("VOLUNTARIO é barrado; COORDENADOR e LABORATORISTA passam", () => {
      expect(() => fakes.store.assertCanManagePurchases({ actor: buyer })).toThrow(LEGACY_DENIED_MESSAGE);
      expect(() => fakes.store.assertCanManagePurchases({ actor: manager })).not.toThrow();
      expect(() =>
        fakes.store.assertCanManagePurchases({ actor: userActor(OWNER_ID, ["LABORATORISTA"]) }),
      ).not.toThrow();
    });

    it("system actor passa (bypass declarado)", () => {
      expect(() => fakes.store.assertCanManagePurchases({ actor: systemActor("NIGHTLY_SWEEP") })).not.toThrow();
    });
  });
});
