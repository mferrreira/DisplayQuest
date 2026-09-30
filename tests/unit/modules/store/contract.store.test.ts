// @vitest-environment node
/**
 * OND8-B3 — contract test store: OLD (StoreServiceGateway legado intacto + RewardRepository/
 * PurchaseRepository legados) vs NEW (createStoreModule com adapters Prisma finos) sobre o
 * MESMO fake Prisma (DEC-18): cada chamada reconstrói os dois lados do seed pristino e
 * compara no limite JSON-observável + estado da store serializado; erros comparados por
 * MENSAGEM.
 *
 * DIVERGÊNCIA ÚNICA (DEC-23, aprovada pelo dono): QUIRK-8S1 — updateReward/patchReward
 * explodem SEMPRE no lado antigo (PrismaClientValidationError 'Unknown argument categoryId');
 * no lado novo FUNCIONAM (adapter escreve só colunas reais). Pinada como teste explícito.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { storeHarness } from "./store-fake-prisma";

vi.mock("@/lib/database/prisma", () => ({ prisma: storeHarness.prisma }));

import { createStoreModule } from "@/backend/modules/store";
import { PrismaPurchaseRepository } from "@/backend/modules/store/infrastructure/repositories/prisma-purchase.repository";
import { PrismaRewardRepository } from "@/backend/modules/store/infrastructure/repositories/prisma-reward.repository";
import { StoreServiceGateway } from "@/backend/modules/store/infrastructure/store-service.gateway";
import { PurchaseRepository } from "@/backend/repositories/PurchaseRepository";
import { RewardRepository } from "@/backend/repositories/RewardRepository";

const FROZEN = new Date("2026-09-16T12:00:00.000Z");

type StoreSide = ReturnType<typeof createStoreModule> | StoreServiceGateway;

function buildOldSide(): StoreSide {
  return new StoreServiceGateway(new RewardRepository(), new PurchaseRepository());
}
function buildNewSide(): StoreSide {
  return createStoreModule({
    ports: { rewards: new PrismaRewardRepository(), purchases: new PrismaPurchaseRepository() },
  });
}

interface RunResult {
  ok: boolean;
  value?: unknown;
  message?: string;
}

async function runOnce(side: StoreSide, call: (store: any) => Promise<unknown>): Promise<{ result: RunResult; snapshot: unknown }> {
  try {
    const value = await call(side)
    return { result: { ok: true, value: JSON.parse(JSON.stringify(value ?? null)) }, snapshot: storeHarness.snapshot() }
  } catch (error: any) {
    return { result: { ok: false, message: error?.message }, snapshot: storeHarness.snapshot() }
  }
}

async function parity(
  seed: () => void,
  call: (store: any) => Promise<unknown>,
  newCall?: (store: any) => Promise<unknown>,
): Promise<{ old: { result: RunResult; snapshot: unknown }; new_: { result: RunResult; snapshot: unknown } }> {
  storeHarness.reset()
  seed()
  const old = await runOnce(buildOldSide(), call)

  storeHarness.reset()
  seed()
  const new_ = await runOnce(buildNewSide(), newCall ?? call)

  // Paridade (DEC-18): mesmo limite JSON-observável (ou mesma mensagem de erro) + mesmo estado.
  if (!old.result.ok && !new_.result.ok) {
    expect(new_.result.message).toBe(old.result.message)
  } else {
    expect(new_.result.ok).toBe(old.result.ok)
    expect(new_.result.value).toEqual(old.result.value)
  }
  expect(new_.snapshot).toEqual(old.snapshot)

  return { old, new_ }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FROZEN)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("contract store — paridade", () => {
  it("listRewards/getReward", async () => {
    const seed = () => {
      storeHarness.seedReward({ name: "Zeta", price: 3 })
      storeHarness.seedReward({ name: "Alfa", price: 1, description: "desc" })
    }
    await parity(seed, (s) => s.listRewards())
    await parity(seed, (s) => s.getReward(1))
    await parity(seed, (s) => s.getReward(999))
  })

  it("createReward: happy + validações verbatim", async () => {
    await parity(() => {}, (s) => s.createReward({ name: " Kit ", price: 15, description: "d" }))
    await parity(() => {}, (s) => s.createReward({ name: "  ", price: 5 }))
    await parity(() => {}, (s) => s.createReward({ name: "ok", price: -1 }))
    await parity(() => {}, (s) => s.createReward({ name: "ok", price: 0 }))
  })

  it("deleteReward: inexistente + FK P2003 com compras", async () => {
    await parity(() => {}, (s) => s.deleteReward(999))
    await parity(
      () => {
        storeHarness.seedUser(100)
        storeHarness.seedReward({ price: 10 })
        storeHarness.world.purchases.push({
          id: storeHarness.world.seq.purchase++,
          userId: 1,
          rewardId: 1,
          rewardName: "Reward 1",
          price: 10,
          purchaseDate: "2026-09-01T12:00:00.000Z",
          status: "completed",
        })
      },
      (s) => s.deleteReward(1),
    )
  })

  it("listPurchases: precedência mutuamente exclusiva (QUIRK-8S6) + escopo A2 no use case (OND8-B4)", async () => {
    const seed = () => {
      storeHarness.seedUser(100)
      storeHarness.seedUser(100)
      storeHarness.seedReward({ price: 10 })
      storeHarness.seedReward({ price: 20 })
      storeHarness.world.purchases.push(
        { id: 1, userId: 1, rewardId: 1, rewardName: "Reward 1", price: 10, purchaseDate: "2026-09-01T12:00:00.000Z", status: "pending" },
        { id: 2, userId: 2, rewardId: 1, rewardName: "Reward 1", price: 10, purchaseDate: "2026-09-02T12:00:00.000Z", status: "approved" },
        { id: 3, userId: 2, rewardId: 2, rewardName: "Reward 2", price: 20, purchaseDate: "2026-09-03T12:00:00.000Z", status: "pending" },
      )
    }
    // OND8-B4: a resolucao de escopo (A2) passou para o use case — o lado novo recebe o
    // input do ator e devolve {denied, purchases}; a paridade compara os purchases.
    const scoped = (input: Record<string, unknown>) => (s: any) =>
      s.listPurchases({ actorId: 1, canManagePurchases: true, ...input }).then((r: any) => r.purchases)

    await parity(seed, (s) => s.listPurchases({ userId: 2, rewardId: 1, status: "pending" }), scoped({ userId: "2", rewardId: "1", status: "pending" }))
    await parity(seed, (s) => s.listPurchases({ rewardId: 1, status: "pending" }), scoped({ rewardId: "1", status: "pending" }))
    await parity(seed, (s) => s.listPurchases({ status: "pending", startDate: new Date("2026-09-02"), endDate: new Date("2026-09-04") }), scoped({ status: "pending", startDate: "2026-09-02", endDate: "2026-09-04" }))
    await parity(seed, (s) => s.listPurchases({ startDate: new Date("2026-09-01T12:00:00.000Z"), endDate: new Date("2026-09-02T12:00:00.000Z") }), scoped({ startDate: "2026-09-01T12:00:00.000Z", endDate: "2026-09-02T12:00:00.000Z" }))
    await parity(seed, (s) => s.listPurchases({}), scoped({}))

    // Escopo A2 (novo lado, comportamento preservado da rota): sem MANAGE_PURCHASES =>
    // userId alheio deny; filtro global deny; sem filtros => proprias compras.
    storeHarness.reset()
    seed()
    const newStore = buildNewSide()
    const denyOther = await (newStore as any).listPurchases({ actorId: 1, canManagePurchases: false, userId: "2" })
    expect(denyOther).toMatchObject({ denied: true, message: "Acesso negado" })
    const denyGlobal = await (newStore as any).listPurchases({ actorId: 1, canManagePurchases: false, status: "pending" })
    expect(denyGlobal).toMatchObject({ denied: true, message: "Acesso negado" })
    const own = await (newStore as any).listPurchases({ actorId: 2, canManagePurchases: false })
    expect(own.denied).toBe(false)
    expect(own.purchases.map((p: any) => p.id)).toEqual([3, 2])
  })

  it("createPurchase: happy + validações + double-check (QUIRK-8S7)", async () => {
    const seed = () => {
      storeHarness.seedUser(100)
      storeHarness.seedReward({ name: "Kit", price: 30 })
    }
    await parity(seed, (s) => s.createPurchase({ userId: 1, rewardId: 1 }))
    await parity(seed, (s) => s.createPurchase({ userId: "abc", rewardId: 1 }))
    await parity(seed, (s) => s.createPurchase({ userId: 0, rewardId: 1 }))
    await parity(seed, (s) => s.createPurchase({ userId: 1, rewardId: 999 }))
    await parity(seed, (s) => s.createPurchase({ userId: 999, rewardId: 1 }))
    await parity(
      () => {
        seed()
        storeHarness.seedReward({ name: "Off", price: 1, available: false })
      },
      (s) => s.createPurchase({ userId: 1, rewardId: 2 }),
    )
    await parity(
      () => {
        storeHarness.seedUser(5)
        storeHarness.seedReward({ name: "Kit", price: 30 })
      },
      (s) => s.createPurchase({ userId: 1, rewardId: 1 }),
    )
  })

  it("updatePurchase cego (QUIRK-8S4): status arbitrário + FK P2003 em userId", async () => {
    const seed = () => {
      storeHarness.seedUser(100)
      storeHarness.seedReward({ price: 10 })
      storeHarness.world.purchases.push({
        id: 1,
        userId: 1,
        rewardId: 1,
        rewardName: "Reward 1",
        price: 10,
        purchaseDate: "2026-09-01T12:00:00.000Z",
        status: "pending",
      })
    }
    await parity(seed, (s) => s.updatePurchase(1, { status: "qualquer-coisa" }))
    await parity(seed, (s) => s.updatePurchase(1, { userId: 999999 }))
    await parity(seed, (s) => s.updatePurchase(999, { status: "x" }))
  })

  it("patchPurchase: approve/reject/complete/cancel/default + refunds (QUIRK-8S5)", async () => {
    const seed = () => {
      storeHarness.seedUser(100)
      storeHarness.seedReward({ price: 30 })
      storeHarness.world.purchases.push({
        id: 1,
        userId: 1,
        rewardId: 1,
        rewardName: "Reward 1",
        price: 30,
        purchaseDate: "2026-09-01T12:00:00.000Z",
        status: "pending",
      })
      storeHarness.world.users[0].points = 70
    }
    await parity(seed, (s) => s.patchPurchase({ purchaseId: 1, action: "approve" }))
    await parity(seed, (s) => s.patchPurchase({ purchaseId: 1, action: "reject" }))
    await parity(seed, (s) => s.patchPurchase({ purchaseId: 1, action: "deny" }))
    await parity(seed, (s) => s.patchPurchase({ purchaseId: 1, action: "complete" }))
    await parity(seed, (s) => s.patchPurchase({ purchaseId: 1, action: "cancel" }))
    await parity(seed, (s) => s.patchPurchase({ purchaseId: 1, action: undefined as any, updateData: { status: "zap" } }))
    await parity(
      () => {
        seed()
        storeHarness.world.purchases[0].status = "completed"
      },
      (s) => s.patchPurchase({ purchaseId: 1, action: "cancel" }),
    )
    await parity(
      () => {
        seed()
        storeHarness.world.purchases[0].status = "rejected"
      },
      (s) => s.patchPurchase({ purchaseId: 1, action: "cancel" }),
    )
  })

  it("getPurchase/deletePurchase", async () => {
    const seed = () => {
      storeHarness.seedUser(100)
      storeHarness.seedReward({ price: 10 })
      storeHarness.world.purchases.push({
        id: 1,
        userId: 1,
        rewardId: 1,
        rewardName: "Reward 1",
        price: 10,
        purchaseDate: "2026-09-01T12:00:00.000Z",
        status: "pending",
      })
    }
    await parity(seed, (s) => s.getPurchase(1))
    await parity(seed, (s) => s.getPurchase(999))
    await parity(seed, (s) => s.deletePurchase(1))
    await parity(seed, (s) => s.deletePurchase(999))
  })
})

describe("contract store — DIVERGÊNCIA DEC-23 (QUIRK-8S1 consertado no lado novo)", () => {
  it("updateReward: lado antigo SEMPRE explode; lado novo funciona", async () => {
    storeHarness.reset()
    storeHarness.seedReward({ name: "R", price: 10 })
    const old = await runOnce(buildOldSide(), (s) => s.updateReward(1, { price: 20 }))
    expect(old.result.ok).toBe(false)
    expect(old.result.message).toContain("Unknown argument `categoryId`")

    storeHarness.reset()
    storeHarness.seedReward({ name: "R", price: 10 })
    const new_ = await runOnce(buildNewSide(), (s) => s.updateReward(1, { price: 20 }))
    expect(new_.result.ok).toBe(true)
    expect((new_.result.value as any).price).toBe(20)
    expect(storeHarness.world.rewards[0].price).toBe(20)
  })

  it("patchReward (todas as actions): lado antigo explode; lado novo aplica", async () => {
    for (const action of ["toggle-availability", "update-price", "update-name", "update-description", undefined] as const) {
      storeHarness.reset()
      storeHarness.seedReward({ name: "R", price: 10 })
      const old = await runOnce(buildOldSide(), (s) =>
        s.patchReward({ rewardId: 1, action: action as any, updateData: { price: 5, name: "novo", description: "d" } }),
      )
      expect(old.result.message).toContain("Unknown argument `categoryId`")

      storeHarness.reset()
      storeHarness.seedReward({ name: "R", price: 10 })
      const new_ = await runOnce(buildNewSide(), (s) =>
        s.patchReward({ rewardId: 1, action: action as any, updateData: { price: 5, name: "novo", description: "d" } }),
      )
      expect(new_.result.ok).toBe(true)
    }
    const row = storeHarness.world.rewards[0]
    expect(row).toMatchObject({ name: "novo", price: 5, description: "d" })
  })

  it("lado novo mantém as guardas de existência do legado", async () => {
    await parity(() => {}, (s) => s.updateReward(999, { price: 1 }))
    await parity(() => {}, (s) => s.patchReward({ rewardId: 999, action: "toggle-availability" }))
  })
})
