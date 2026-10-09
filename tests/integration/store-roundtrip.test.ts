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
import { ConflictError, NotFoundError, userActor, ValidationError } from "@/backend/domain";
import { createStoreModule } from "@/backend/modules/store";

const store = createStoreModule();

/**
 * B6-2a (D4, DEC-53): createReward/updateReward/patchReward/deleteReward passaram a exigir
 * MANAGE_REWARDS, que a rota decidia com `ensurePermission` SEM mensagem (por isso o 403
 * continua sendo o "Acesso negado" default). Este roundtrip exercita persistencia, nao
 * autorizacao — o ator e o proprio harness, e por isso ele se apresenta como COORDENADOR.
 * A negacao por papel e testada no use case (`tests/unit/modules/store/`).
 *
 * B6-2d (D4): os seis metodos de compra passaram a exigir ator. Dois atores de harness:
 * `buyer` (o VOLUNTARIO da semente, comprando PARA SI — o caminho que nao precisa de
 * MANAGE_PURCHASES) e `manager` (COORDENADOR, o unico que pode comprar PARA OUTRO, ler/
 * atualizar/excluir compra alheia e fazer approve/reject/complete). Onde o teste anterior
 * exercitava validacao de compra PARA OUTRO com um ator sem permissao, o ator agora e o
 * manager — senao o gate (403) chegaria antes da validacao que o teste quer provar.
 */
const MANAGER_ROLES = ["COORDENADOR"];
let buyer = userActor(0, ["VOLUNTARIO"]);
let manager = userActor(0, MANAGER_ROLES);

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
    buyer = userActor(userId, ["VOLUNTARIO"]);
    manager = userActor(otherUserId, MANAGER_ROLES);

    const reward = await store.createReward({ actorRoles: MANAGER_ROLES, data: { name: ` G8 Kit ${stamp} `, price: 30, description: "kit de teste" } });
    rewardId = reward.id as number;
    const off = await store.createReward({ actorRoles: MANAGER_ROLES, data: { name: `G8 Off ${stamp}`, price: 1, available: false } });
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
    const updated = await store.updateReward({ actorRoles: MANAGER_ROLES, rewardId, data: { price: 25 } });
    expect(updated.price).toBe(25);

    const toggled = await store.patchReward({ actorRoles: MANAGER_ROLES, rewardId, action: "toggle-availability" });
    expect(toggled.available).toBe(false);
    const back = await store.patchReward({ actorRoles: MANAGER_ROLES, rewardId, action: "toggle-availability" });
    expect(back.available).toBe(true);

    await expect(store.updateReward({ actorRoles: MANAGER_ROLES, rewardId, data: { price: -1 } })).rejects.toThrow(ValidationError);
    await expect(store.updateReward({ actorRoles: MANAGER_ROLES, rewardId: 999999, data: { price: 1 } })).rejects.toThrow(NotFoundError);
    await expect(store.createReward({ actorRoles: MANAGER_ROLES, data: { name: "  ", price: 1 } })).rejects.toThrow(ValidationError);
  });

  it("createPurchase: happy com debito + validacoes tipadas (NotFound/Validation)", async () => {
    const purchase = await store.createPurchase({ actor: buyer, data: { userId, rewardId } });
    purchaseId = purchase.id as number;
    expect(purchase).toMatchObject({ userId, rewardId, rewardName: `G8 Kit ${stamp}`, price: 25, status: "pending" });
    expect(await points(userId)).toBe(75);

    // "PARA OUTRO" e "userId invalido" so chegam na validacao de compra com quem PODE comprar
    // para outro (gate 403 viria antes) — o ator dessas chamadas e o manager.
    await expect(store.createPurchase({ actor: manager, data: { userId: "abc", rewardId } })).rejects.toThrow(ValidationError);
    await expect(store.createPurchase({ actor: manager, data: { userId: 999999, rewardId } })).rejects.toThrow(NotFoundError);
    await expect(store.createPurchase({ actor: buyer, data: { userId, rewardId: 999999 } })).rejects.toThrow(NotFoundError);
    await expect(store.createPurchase({ actor: buyer, data: { userId, rewardId: offRewardId } })).rejects.toThrow(ValidationError);

    await expect(store.createPurchase({ actor: manager, data: { userId: otherUserId, rewardId } })).rejects.toThrow(ValidationError);
    expect(await points(otherUserId)).toBe(5);
  });

  it("listPurchases: escopo A2 no use case (deny preservado) + proprias compras", async () => {
    const own = await store.listPurchases({ actor: buyer });
    expect(own.denied).toBe(false);
    if (own.denied) throw new Error("escopo deveria permitir as proprias compras")
    expect(own.purchases.some((p) => p.id === purchaseId)).toBe(true);

    const denyOther = await store.listPurchases({ actor: buyer, userId: String(otherUserId) });
    expect(denyOther).toMatchObject({ denied: true, message: "Acesso negado" });

    const denyGlobal = await store.listPurchases({ actor: buyer, status: "pending" });
    expect(denyGlobal).toMatchObject({ denied: true, message: "Acesso negado" });

    const all = await store.listPurchases({ actor: manager });
    expect(all.denied).toBe(false);
  });

  it("patchPurchase: reject com refund (QUIRK-8S5) + guards tipados", async () => {
    // approve/reject/complete exigem MANAGE_PURCHASES ate para o dono (medido na rota legada);
    // o ator e o manager. A negacao por papel e testada em use-cases.purchase-authorization.
    const rejected = await store.patchPurchase({ actor: manager, purchaseId, action: "reject" });
    expect(rejected.status).toBe("rejected");
    expect(await points(userId)).toBe(100); // reembolso pelo preco congelado no snapshot (25)

    await expect(store.patchPurchase({ actor: manager, purchaseId, action: "approve" })).rejects.toThrow(ConflictError);
    await expect(store.patchPurchase({ actor: manager, purchaseId, action: "complete" })).rejects.toThrow(ConflictError);
  });

  it("updatePurchase cego (QUIRK-8S4) + approve->complete->cancel guardado + delete", async () => {
    const second = await store.createPurchase({ actor: buyer, data: { userId, rewardId } });
    expect(await points(userId)).toBe(75);

    const approved = await store.patchPurchase({ actor: manager, purchaseId: second.id as number, action: "approve" });
    expect(approved.status).toBe("approved");
    const completed = await store.patchPurchase({ actor: manager, purchaseId: second.id as number, action: "complete" });
    expect(completed.status).toBe("completed");
    await expect(store.patchPurchase({ actor: manager, purchaseId: second.id as number, action: "cancel" })).rejects.toThrow(ConflictError);

    // update cego: escreve status arbitrario SEM guardas (legado)
    const blind = await store.updatePurchase({ actor: manager, purchaseId: second.id as number, data: { status: "qualquer-coisa" } });
    expect(blind.status).toBe("qualquer-coisa");

    // cancel agora passa (status != completed) e NAO reembolsa (status nao-pending/approved)
    const cancelled = await store.patchPurchase({ actor: manager, purchaseId: second.id as number, action: "cancel" });
    expect(cancelled.status).toBe("cancelled");
    expect(await points(userId)).toBe(75);

    await store.deletePurchase({ actor: manager, purchaseId: second.id as number });
    await store.deletePurchase({ actor: manager, purchaseId });
    expect(await store.getPurchase(manager, purchaseId)).toBeNull();

    // FK: deleteReward com compra existente -> P2003 propagado (compra de outro usuario)
    await store.patchReward({ actorRoles: MANAGER_ROLES, rewardId: offRewardId, action: "toggle-availability" }) // disponivel p/ compra
    const blocking = await store.createPurchase({ actor: manager, data: { userId: otherUserId, rewardId: offRewardId } });
    await expect(store.deleteReward({ actorRoles: MANAGER_ROLES, rewardId: offRewardId })).rejects.toThrow(/Foreign key constraint violated|P2003/);
    await store.deletePurchase({ actor: manager, purchaseId: blocking.id as number });
    await store.deleteReward({ actorRoles: MANAGER_ROLES, rewardId: offRewardId });
    expect(await store.getReward(offRewardId)).toBeNull();
  });
});
