// @vitest-environment node
/**
 * OND8-B4 — G4 roundtrip smoke of the STORE module against the ISOLATED test DB
 * (127.0.0.1:5433 — DEC-10/BLOCKER-02; never 5432).
 *
 * Wiring NOVA end-to-end com Prisma real (nenhum mock nos repositorios): os 2 adapters
 * finos (PrismaRewardRepository/PrismaPurchaseRepository) + use cases + regras puras.
 *
 * Fluxo: createReward -> getReward/listRewards (shape JSON com fantasma null) ->
 * updateReward + patchReward FUNCIONANDO (DEC-23 — o conserto do QUIRK-8S1 provado no
 * banco real) -> createPurchase happy (debito de pontos) + validacoes tipadas
 * (NotFound/Validation) -> escopo A2 no use case (deny preservado) -> patchPurchase
 * approve/reject (refund)/complete/cancel -> updatePurchase cego -> deletes -> FK P2003
 * em deleteReward com compra.
 *
 * Cleanup em afterAll: purchases, rewards, users seedados (stamp).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/backend/domain";
import { createStoreModule } from "@/backend/modules/store";

const store = createStoreModule();

const stamp = Date.now();
let userId = 0;
let otherUserId = 0;
let rewardId = 0;
let offRewardId = 0;
let purchaseId = 0;

async function points(id: number): Promise<number> {
  const user = await prisma.users.findUnique({ where: { id }, select: { points: true } });
  return user?.points ?? -1;
}

describe("G4 roundtrip — store (isolated test DB)", () => {
  beforeAll(async () => {
    const user = await prisma.users.create({
      data: {
        name: `G8 Comprador ${stamp}`,
        email: `g8-store-user-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
        points: 100,
      },
      select: { id: true },
    });
    const other = await prisma.users.create({
      data: {
        name: `G8 Gerente ${stamp}`,
        email: `g8-store-manager-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["COORDENADOR"],
        points: 5,
      },
      select: { id: true },
    });
    userId = user.id;
    otherUserId = other.id;

    const reward = await store.createReward({ name: ` G8 Kit ${stamp} `, price: 30, description: "kit de teste" });
    rewardId = reward.id as number;
    const off = await store.createReward({ name: `G8 Off ${stamp}`, price: 1, available: false });
    offRewardId = off.id as number;
  });

  afterAll(async () => {
    await prisma.purchases.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
    await prisma.rewards.deleteMany({ where: { id: { in: [rewardId, offRewardId] } } });
    await prisma.users.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  });

  it("rewards: create/get/list com shape JSON legado (fantasma null) + update/patch CONSERTADOS (DEC-23)", async () => {
    const created = await store.getReward(rewardId);
    expect(created).toMatchObject({ name: `G8 Kit ${stamp}`, price: 30, description: "kit de teste", available: true });
    expect(created).toHaveProperty("categoryId", null);
    expect(created).toHaveProperty("stock", null);
    expect(created).toHaveProperty("imageUrl", null);

    // DEC-23: no legado isto SEMPRE explodia (PrismaClientValidationError 'Unknown argument
    // categoryId'); na wiring nova funciona contra o banco real.
    const updated = await store.updateReward(rewardId, { price: 25 });
    expect(updated.price).toBe(25);

    const toggled = await store.patchReward({ rewardId, action: "toggle-availability" });
    expect(toggled.available).toBe(false);
    const back = await store.patchReward({ rewardId, action: "toggle-availability" });
    expect(back.available).toBe(true);

    await expect(store.updateReward(rewardId, { price: -1 })).rejects.toThrow(ValidationError);
    await expect(store.updateReward(999999, { price: 1 })).rejects.toThrow(NotFoundError);
    await expect(store.createReward({ name: "  ", price: 1 })).rejects.toThrow(ValidationError);
  });

  it("createPurchase: happy com debito + validacoes tipadas (NotFound/Validation)", async () => {
    const purchase = await store.createPurchase({ userId, rewardId });
    purchaseId = purchase.id as number;
    expect(purchase).toMatchObject({ userId, rewardId, rewardName: `G8 Kit ${stamp}`, price: 25, status: "pending" });
    expect(await points(userId)).toBe(75);

    await expect(store.createPurchase({ userId: "abc", rewardId })).rejects.toThrow(ValidationError);
    await expect(store.createPurchase({ userId: 999999, rewardId })).rejects.toThrow(NotFoundError);
    await expect(store.createPurchase({ userId, rewardId: 999999 })).rejects.toThrow(NotFoundError);
    await expect(store.createPurchase({ userId, rewardId: offRewardId })).rejects.toThrow(ValidationError);

    await expect(store.createPurchase({ userId: otherUserId, rewardId })).rejects.toThrow(ValidationError);
    expect(await points(otherUserId)).toBe(5);
  });

  it("listPurchases: escopo A2 no use case (deny preservado) + proprias compras", async () => {
    const own = await store.listPurchases({ actorId: userId, canManagePurchases: false });
    expect(own.denied).toBe(false);
    if (own.denied) throw new Error("escopo deveria permitir as proprias compras")
    expect(own.purchases.some((p) => p.id === purchaseId)).toBe(true);

    const denyOther = await store.listPurchases({ actorId: userId, canManagePurchases: false, userId: String(otherUserId) });
    expect(denyOther).toMatchObject({ denied: true, message: "Acesso negado" });

    const denyGlobal = await store.listPurchases({ actorId: userId, canManagePurchases: false, status: "pending" });
    expect(denyGlobal).toMatchObject({ denied: true, message: "Acesso negado" });

    const all = await store.listPurchases({ actorId: otherUserId, canManagePurchases: true });
    expect(all.denied).toBe(false);
  });

  it("patchPurchase: reject com refund (QUIRK-8S5) + guards tipados", async () => {
    const rejected = await store.patchPurchase({ purchaseId, action: "reject" });
    expect(rejected.status).toBe("rejected");
    expect(await points(userId)).toBe(100); // reembolso pelo preco congelado no snapshot (25)

    await expect(store.patchPurchase({ purchaseId, action: "approve" })).rejects.toThrow(ConflictError);
    await expect(store.patchPurchase({ purchaseId, action: "complete" })).rejects.toThrow(ConflictError);
  });

  it("updatePurchase cego (QUIRK-8S4) + approve->complete->cancel guardado + delete", async () => {
    const second = await store.createPurchase({ userId, rewardId });
    expect(await points(userId)).toBe(75);

    const approved = await store.patchPurchase({ purchaseId: second.id as number, action: "approve" });
    expect(approved.status).toBe("approved");
    const completed = await store.patchPurchase({ purchaseId: second.id as number, action: "complete" });
    expect(completed.status).toBe("completed");
    await expect(store.patchPurchase({ purchaseId: second.id as number, action: "cancel" })).rejects.toThrow(ConflictError);

    // update cego: escreve status arbitrario SEM guardas (legado)
    const blind = await store.updatePurchase(second.id as number, { status: "qualquer-coisa" });
    expect(blind.status).toBe("qualquer-coisa");

    // cancel agora passa (status != completed) e NAO reembolsa (status nao-pending/approved)
    const cancelled = await store.patchPurchase({ purchaseId: second.id as number, action: "cancel" });
    expect(cancelled.status).toBe("cancelled");
    expect(await points(userId)).toBe(75);

    await store.deletePurchase(second.id as number);
    await store.deletePurchase(purchaseId);
    expect(await store.getPurchase(purchaseId)).toBeNull();

    // FK: deleteReward com compra existente -> P2003 propagado (compra de outro usuario)
    await store.patchReward({ rewardId: offRewardId, action: "toggle-availability" }) // disponivel p/ compra
    const blocking = await store.createPurchase({ userId: otherUserId, rewardId: offRewardId });
    await expect(store.deleteReward(offRewardId)).rejects.toThrow(/Foreign key constraint violated|P2003/);
    await store.deletePurchase(blocking.id as number);
    await store.deleteReward(offRewardId);
    expect(await store.getReward(offRewardId)).toBeNull();
  });
});
