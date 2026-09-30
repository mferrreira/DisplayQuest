// @vitest-environment node
/**
 * OND8-B1 — golden suite do STORE legado (R0).
 *
 * Pinado sobre o gateway INTACTO (StoreServiceGateway + RewardRepository + PurchaseRepository
 * reais) sobre fake Prisma que modela a SEMÂNTICA do schema (DEC-15/R0):
 *   - rewards tem APENAS id/name/description/price/available — update com campos fantasma
 *     (categoryId/stock/imageUrl, que Reward.toPrisma sempre escreve depois de fromPrisma)
 *     explode com PrismaClientValidationError "Unknown argument `categoryId`".
 *   - purchases.purchaseDate é String (ISO); FKs userId/rewardId restrict (P2003).
 *   - users.points com decrement/increment; $transaction(callback).
 *
 * QUIRKS pinados (preservados na reimplementação; divergência exige decisão do dono):
 *   QUIRK-8S1: updateReward/patchReward SEMPRE falham em produção (Unknown argument
 *     `categoryId`) — Reward.fromPrisma nullifica categoryId/stock/imageUrl e toPrisma os
 *     escreve de volta num schema que não tem essas colunas. PUT/PATCH /rewards/[id] quebrado.
 *   QUIRK-8S2: Reward.fromPrisma devolve categoryId/stock/imageUrl null (colunas não existem);
 *     createPurchase checa reward.stock mas ele é sempre null => inStock sempre true.
 *   QUIRK-8S3: deleteReward com compras referenciando -> P2003 (FK restrict, sem mensagem amiga).
 *   QUIRK-8S4: updatePurchase faz Object.assign CEGO (status arbitrário é escrito sem validação;
 *     userId inexistente -> P2003).
 *   QUIRK-8S5: reject sempre reembolsa (shouldRefund === true por construção); cancel reembolsa
 *     pending/approved mas NÃO rejected; completed não cancela.
 *   QUIRK-8S6: listPurchases tem precedência MUTUAMENTE EXCLUSIVA userId > rewardId > status >
 *     (startDate&&endDate filtrado em memória) > findAll; compras em purchaseDate DESC.
 *   QUIRK-8S7: createPurchase valida fora e revalida DENTRO da transação (double-check de
 *     points); decrement + create atômicos; snapshot rewardName/price no momento da compra.
 *   QUIRK-8S8: patchReward default aplica updateData; patchPurchase default => updatePurchase
 *     (Object.assign cego).
 *   QUIRK-8S9: listRewards ordena por name ASC.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface StoreWorld {
  users: Array<{ id: number; name: string; points: number; status: string }>
  rewards: Array<{ id: number; name: string; description: string | null; price: number; available: boolean }>
  purchases: Array<{ id: number; userId: number; rewardId: number; rewardName: string; price: number; purchaseDate: string; status: string }>
  seq: { user: number; reward: number; purchase: number }
}

const REWARD_ALLOWED_KEYS = new Set(["name", "description", "price", "available"])
const PURCHASE_ALLOWED_KEYS = new Set(["userId", "rewardId", "rewardName", "price", "purchaseDate", "status"])

const fake = vi.hoisted(() => {
  function validationError(unknownArg: string) {
    const e: any = new Error(
      `Invalid invocation:\n{\n  data: {\n    ${unknownArg}: null,\n  }\n}\n\nUnknown argument \`${unknownArg}\`. Available options are marked with ?.`,
    )
    e.name = "PrismaClientValidationError"
    return e
  }

  function fkError(constraint: string) {
    const e: any = new Error(
      `Foreign key constraint violated on the constraint: \`${constraint}\``,
    )
    e.name = "PrismaClientKnownRequestError"
    e.code = "P2003"
    return e
  }

  const world: StoreWorld = { users: [], rewards: [], purchases: [], seq: { user: 1, reward: 1, purchase: 1 } }

  const assertRewardKeys = (data: any) => {
    for (const key of Object.keys(data)) {
      if (!REWARD_ALLOWED_KEYS.has(key)) throw validationError(key)
    }
  }
  const assertPurchaseKeys = (data: any) => {
    for (const key of Object.keys(data)) {
      if (!PURCHASE_ALLOWED_KEYS.has(key)) throw validationError(key)
    }
  }
  const assertPurchaseFks = (data: any) => {
    if (!world.users.some((u) => u.id === data.userId)) throw fkError("purchases_userId_fkey")
    if (!world.rewards.some((r) => r.id === data.rewardId)) throw fkError("purchases_rewardId_fkey")
  }
  const purchaseWithIncludes = (row: any) => ({
    ...row,
    user: world.users.find((u) => u.id === row.userId) ?? null,
    reward: world.rewards.find((r) => r.id === row.rewardId) ?? null,
  })
  const sortPurchasesDesc = (rows: any[]) =>
    [...rows].sort((a, b) => (a.purchaseDate < b.purchaseDate ? 1 : a.purchaseDate > b.purchaseDate ? -1 : 0))

  const tableOps = {
    rewards: {
      findUnique: async ({ where }: any) => {
        const row = world.rewards.find((r) => r.id === where.id)
        return row ? { ...row } : null
      },
      findMany: async ({ where }: any = {}) => {
        let rows = world.rewards
        if (where?.available !== undefined) rows = rows.filter((r) => r.available === where.available)
        return [...rows].sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ ...r }))
      },
      create: async ({ data }: any) => {
        assertRewardKeys(data)
        const row = { id: world.seq.reward++, name: data.name, description: data.description ?? null, price: data.price, available: data.available }
        world.rewards.push(row)
        return { ...row }
      },
      update: async ({ where, data }: any) => {
        assertRewardKeys(data)
        const row = world.rewards.find((r) => r.id === where.id)
        if (!row) throw fkError("rewards_pkey")
        Object.assign(row, data)
        return { ...row }
      },
      delete: async ({ where }: any) => {
        if (world.purchases.some((p) => p.rewardId === where.id)) throw fkError("purchases_rewardId_fkey")
        const idx = world.rewards.findIndex((r) => r.id === where.id)
        if (idx === -1) throw fkError("rewards_pkey")
        return world.rewards.splice(idx, 1)[0]
      },
    },
    purchases: {
      findUnique: async ({ where, include }: any) => {
        const row = world.purchases.find((p) => p.id === where.id)
        if (!row) return null
        return include?.user || include?.reward ? purchaseWithIncludes(row) : { ...row }
      },
      findMany: async ({ where, include }: any = {}) => {
        let rows = world.purchases
        if (where?.userId !== undefined) rows = rows.filter((p) => p.userId === where.userId)
        if (where?.rewardId !== undefined) rows = rows.filter((p) => p.rewardId === where.rewardId)
        if (where?.status !== undefined) rows = rows.filter((p) => p.status === where.status)
        return sortPurchasesDesc(rows).map((p) => (include?.user || include?.reward ? purchaseWithIncludes(p) : { ...p }))
      },
      create: async ({ data, include }: any) => {
        assertPurchaseKeys(data)
        assertPurchaseFks(data)
        const row = {
          id: world.seq.purchase++,
          userId: data.userId,
          rewardId: data.rewardId,
          rewardName: data.rewardName,
          price: data.price,
          purchaseDate: data.purchaseDate,
          status: data.status,
        }
        world.purchases.push(row)
        return include?.user || include?.reward ? purchaseWithIncludes(row) : { ...row }
      },
      update: async ({ where, data, include }: any) => {
        assertPurchaseKeys(data)
        assertPurchaseFks(data)
        const row = world.purchases.find((p) => p.id === where.id)
        if (!row) throw fkError("purchases_pkey")
        Object.assign(row, data)
        return include?.user || include?.reward ? purchaseWithIncludes(row) : { ...row }
      },
      delete: async ({ where }: any) => {
        const idx = world.purchases.findIndex((p) => p.id === where.id)
        if (idx === -1) throw fkError("purchases_pkey")
        return world.purchases.splice(idx, 1)[0]
      },
    },
    users: {
      findUnique: async ({ where, select }: any) => {
        const row = world.users.find((u) => u.id === where.id)
        if (!row) return null
        if (select) {
          const out: any = {}
          for (const key of Object.keys(select)) if (select[key]) out[key] = (row as any)[key]
          return out
        }
        return { ...row }
      },
      update: async ({ where, data }: any) => {
        const row = world.users.find((u) => u.id === where.id)
        if (!row) throw fkError("users_pkey")
        if (typeof data.points === "object" && data.points !== null) {
          if (data.points.decrement !== undefined) row.points -= data.points.decrement
          if (data.points.increment !== undefined) row.points += data.points.increment
        } else if (data.points !== undefined) {
          row.points = data.points
        }
        return { ...row }
      },
    },
  }

  const prisma = {
    ...tableOps,
    $transaction: async (arg: any) => {
      if (typeof arg === "function") return await arg(tableOps)
      return await Promise.all(arg)
    },
  }

  return { world, prisma }
})

vi.mock("@/lib/database/prisma", () => ({ prisma: fake.prisma }))

// OND8-B3: o golden indexa o SEAM LEGADO diretamente (padrão da casa, DEC-15 — igual ao
// reporting 7.1): createStoreModule() agora devolve a wiring NOVA; as asserções abaixo
// continuam pinando o comportamento do gateway legado, INTACTO.
import { StoreServiceGateway } from "@/backend/modules/store/infrastructure/store-service.gateway"
import { PurchaseRepository } from "@/backend/repositories/PurchaseRepository"
import { RewardRepository } from "@/backend/repositories/RewardRepository"

const store = new StoreServiceGateway(new RewardRepository(), new PurchaseRepository())

function seedUser(points = 100) {
  const row = { id: fake.world.seq.user++, name: `U${fake.world.seq.user}`, points, status: "active" }
  fake.world.users.push(row)
  return row
}
function seedReward(overrides: Partial<{ name: string; price: number; available: boolean; description: string | null }> = {}) {
  const row = {
    id: fake.world.seq.reward++,
    name: overrides.name ?? `Reward ${fake.world.seq.reward}`,
    description: overrides.description ?? null,
    price: overrides.price ?? 10,
    available: overrides.available ?? true,
  }
  fake.world.rewards.push(row)
  return row
}

beforeEach(() => {
  fake.world.users = []
  fake.world.rewards = []
  fake.world.purchases = []
  fake.world.seq = { user: 1, reward: 1, purchase: 1 }
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("listRewards/getReward", () => {
  it("lista por name ASC e devolve campos fantasma null (QUIRK-8S2/8S9)", async () => {
    seedReward({ name: "Zeta", price: 3 })
    seedReward({ name: "Alfa", price: 1, description: "desc" })
    const rewards = await store.listRewards()
    expect(rewards.map((r) => r.name)).toEqual(["Alfa", "Zeta"])
    expect(rewards[0]).toMatchObject({ name: "Alfa", price: 1, available: true, description: "desc" })
    expect(rewards[0].categoryId).toBeNull()
    expect(rewards[0].stock).toBeNull()
    expect(rewards[0].imageUrl).toBeNull()
  })

  it("getReward inexistente => null", async () => {
    expect(await store.getReward(999)).toBeNull()
  })
})

describe("createReward", () => {
  it("validações legadas verbatim; available default true", async () => {
    await expect(store.createReward({ name: "  ", price: 5 })).rejects.toThrow("Nome da recompensa é obrigatório")
    await expect(store.createReward({ name: "ok", price: NaN })).rejects.toThrow("Preço deve ser um número não negativo")
    await expect(store.createReward({ name: "ok", price: -1 })).rejects.toThrow("Preço deve ser um número não negativo")

    const created = await store.createReward({ name: "ok", price: 0 })
    expect(created).toMatchObject({ name: "ok", price: 0, available: true, description: null })
  })
})

describe("QUIRK-8S1: updateReward/patchReward quebrados em produção", () => {
  it("updateReward SEMPRE explode: toPrisma escreve categoryId/stock/imageUrl em schema sem colunas", async () => {
    const reward = seedReward({ name: "R", price: 10 })
    const err: any = await store.updateReward(reward.id, { price: 20 }).catch((e) => e)
    expect(err.name).toBe("PrismaClientValidationError")
    expect(err.message).toContain("Unknown argument `categoryId`")
    expect(fake.world.rewards.find((r) => r.id === reward.id)?.price).toBe(10) // nada mudou
  })

  it("patchReward (todas as actions e default) explode do mesmo jeito", async () => {
    const reward = seedReward({ name: "R", price: 10 })
    for (const action of ["toggle-availability", "update-price", "update-name", "update-description", undefined] as const) {
      const err: any = await store
        .patchReward({ rewardId: reward.id, action: action as any, updateData: { price: 5, name: "novo", description: "d" } })
        .catch((e) => e)
      expect(err.name).toBe("PrismaClientValidationError")
      expect(err.message).toContain("Unknown argument `categoryId`")
    }
  })

  it("patchReward update-name SEM name falha na validação ANTES do phantom", async () => {
    const reward = seedReward({ name: "R", price: 10 })
    await expect(store.patchReward({ rewardId: reward.id, action: "update-name", updateData: {} })).rejects.toThrow(
      "Nome da recompensa é obrigatório",
    )
    await expect(store.patchReward({ rewardId: reward.id, action: "update-price", updateData: { price: -5 } })).rejects.toThrow(
      "Preço deve ser um número não negativo",
    )
  })

  it("updateReward em recompensa inexistente falha ANTES do phantom: 'Recompensa não encontrada'", async () => {
    await expect(store.updateReward(999, { price: 1 })).rejects.toThrow("Recompensa não encontrada")
    await expect(store.patchReward({ rewardId: 999, action: "toggle-availability" })).rejects.toThrow("Recompensa não encontrada")
  })
})

describe("deleteReward", () => {
  it("inexistente => 'Recompensa não encontrada'; com compras => P2003 (QUIRK-8S3)", async () => {
    await expect(store.deleteReward(999)).rejects.toThrow("Recompensa não encontrada")

    const user = seedUser(100)
    const reward = seedReward({ price: 10 })
    fake.world.purchases.push({ id: fake.world.seq.purchase++, userId: user.id, rewardId: reward.id, rewardName: reward.name, price: 10, purchaseDate: "2026-09-01T12:00:00.000Z", status: "completed" })
    const err: any = await store.deleteReward(reward.id).catch((e) => e)
    expect(err.name).toBe("PrismaClientKnownRequestError")
    expect(err.code).toBe("P2003")
  })
})

describe("listPurchases (QUIRK-8S6)", () => {
  it("precedência mutuamente exclusiva userId > rewardId > status > datas > tudo; DESC por purchaseDate", async () => {
    const u1 = seedUser(100)
    const u2 = seedUser(100)
    const r1 = seedReward({ price: 10 })
    const r2 = seedReward({ price: 20 })
    fake.world.purchases.push(
      { id: 1, userId: u1.id, rewardId: r1.id, rewardName: r1.name, price: 10, purchaseDate: "2026-09-01T12:00:00.000Z", status: "pending" },
      { id: 2, userId: u2.id, rewardId: r1.id, rewardName: r1.name, price: 10, purchaseDate: "2026-09-02T12:00:00.000Z", status: "approved" },
      { id: 3, userId: u2.id, rewardId: r2.id, rewardName: r2.name, price: 20, purchaseDate: "2026-09-03T12:00:00.000Z", status: "pending" },
    )

    // userId vence rewardId e status
    expect((await store.listPurchases({ userId: u2.id, rewardId: r1.id, status: "pending" })).map((p) => p.id)).toEqual([3, 2])
    // rewardId vence status
    expect((await store.listPurchases({ rewardId: r1.id, status: "pending" })).map((p) => p.id)).toEqual([2, 1])
    // status vence datas (branch status retorna TODAS as pending — datas ignoradas)
    expect((await store.listPurchases({ status: "pending", startDate: new Date("2026-09-02"), endDate: new Date("2026-09-04") })).map((p) => p.id)).toEqual([3, 1])
    // datas filtram em memória (ambas necessárias)
    const ranged = await store.listPurchases({ startDate: new Date("2026-09-01T12:00:00.000Z"), endDate: new Date("2026-09-02T12:00:00.000Z") })
    expect(ranged.map((p) => p.id)).toEqual([2, 1])
    // só startDate não filtra (precisa das duas)
    expect((await store.listPurchases({ startDate: new Date("2026-09-02") })).map((p) => p.id)).toEqual([3, 2, 1])
    // vazio => tudo DESC
    expect((await store.listPurchases({})).map((p) => p.id)).toEqual([3, 2, 1])
  })
})

describe("createPurchase (QUIRK-8S2/8S7)", () => {
  it("happy path: decrementa points, snapshot rewardName/price, status pending, purchaseDate ISO", async () => {
    const user = seedUser(100)
    const reward = seedReward({ name: "Kit", price: 30 })
    const purchase = await store.createPurchase({ userId: user.id, rewardId: reward.id })
    expect(purchase).toMatchObject({ userId: user.id, rewardId: reward.id, rewardName: "Kit", price: 30, status: "pending" })
    expect(purchase.purchaseDate).toBeInstanceOf(Date) // modelo devolve Date; a COLUNA é String ISO
    expect(fake.world.purchases[0].purchaseDate).toBe(new Date(purchase.purchaseDate).toISOString())
    expect(fake.world.users.find((u) => u.id === user.id)?.points).toBe(70)
    expect(fake.world.purchases).toHaveLength(1)
  })

  it("validações legadas verbatim", async () => {
    const user = seedUser(5)
    const reward = seedReward({ price: 10 })
    const unavailable = seedReward({ price: 1, available: false })

    // QUIRK: userId 0 PASSA do Number.isInteger e vira "Usuário não encontrado"
    await expect(store.createPurchase({ userId: "abc", rewardId: reward.id })).rejects.toThrow("userId e rewardId são obrigatórios")
    await expect(store.createPurchase({ userId: 0, rewardId: reward.id })).rejects.toThrow("Usuário não encontrado")
    await expect(store.createPurchase({ userId: user.id, rewardId: 999 })).rejects.toThrow("Recompensa não encontrada")
    await expect(store.createPurchase({ userId: 999, rewardId: reward.id })).rejects.toThrow("Usuário não encontrado")
    await expect(store.createPurchase({ userId: user.id, rewardId: unavailable.id })).rejects.toThrow("Esta recompensa não está disponível")
    await expect(store.createPurchase({ userId: user.id, rewardId: reward.id })).rejects.toThrow(
      "Pontos insuficientes. Você tem 5 pontos, mas precisa de 10 pontos",
    )
    expect(fake.world.purchases).toHaveLength(0)
  })

  it("stock fantasma: reward 'sem estoque' não existe no schema — inStock sempre true (QUIRK-8S2)", async () => {
    const user = seedUser(100)
    const reward = seedReward({ price: 10 })
    // mesmo setando stock no input, fromPrisma nullifica => compra passa
    await store.createReward({ name: "outra", price: 1 })
    const purchase = await store.createPurchase({ userId: user.id, rewardId: reward.id })
    expect(purchase.status).toBe("pending")
  })
})

describe("patchPurchase: approve/reject/complete/cancel (QUIRK-8S5)", () => {
  async function pendingPurchase() {
    const user = seedUser(100)
    const reward = seedReward({ price: 30 })
    const purchase = await store.createPurchase({ userId: user.id, rewardId: reward.id })
    return { user, reward, purchase }
  }

  it("approve: pending -> approved; não-pending => mensagem legada", async () => {
    const { purchase } = await pendingPurchase()
    const approved = await store.patchPurchase({ purchaseId: purchase.id!, action: "approve" })
    expect(approved.status).toBe("approved")
    await expect(store.patchPurchase({ purchaseId: purchase.id!, action: "approve" })).rejects.toThrow("Apenas compras pendentes podem ser aprovadas")
  })

  it("reject reembolsa SEMPRE (shouldRefund true por construção); 2a reject => mensagem", async () => {
    const { user, purchase } = await pendingPurchase()
    const rejected = await store.patchPurchase({ purchaseId: purchase.id!, action: "deny" })
    expect(rejected.status).toBe("rejected")
    expect(fake.world.users.find((u) => u.id === user.id)?.points).toBe(100)
    await expect(store.patchPurchase({ purchaseId: purchase.id!, action: "reject" })).rejects.toThrow("Apenas compras pendentes podem ser rejeitadas")
  })

  it("complete exige approved; cancel reembolsa pending/approved, recusado p/ completed, rejected cancela SEM reembolso", async () => {
    const { user, purchase } = await pendingPurchase()
    await expect(store.patchPurchase({ purchaseId: purchase.id!, action: "complete" })).rejects.toThrow("Apenas compras aprovadas podem ser completadas")

    await store.patchPurchase({ purchaseId: purchase.id!, action: "approve" })
    const completed = await store.patchPurchase({ purchaseId: purchase.id!, action: "complete" })
    expect(completed.status).toBe("completed")
    await expect(store.patchPurchase({ purchaseId: purchase.id!, action: "cancel" })).rejects.toThrow("Compras completadas não podem ser canceladas")
    expect(fake.world.users.find((u) => u.id === user.id)?.points).toBe(70) // sem refund

    // rejected -> cancel sem refund (shouldRefund só pending/approved)
    const second = await pendingPurchase()
    await store.patchPurchase({ purchaseId: second.purchase.id!, action: "reject" }) // refund: 100
    const cancelled = await store.patchPurchase({ purchaseId: second.purchase.id!, action: "cancel" })
    expect(cancelled.status).toBe("cancelled")
    expect(fake.world.users.find((u) => u.id === second.user.id)?.points).toBe(100) // sem refund duplo
  })

  it("QUIRK-8S8: action desconhecida/ausente cai em updatePurchase (Object.assign cego)", async () => {
    const { purchase } = await pendingPurchase()
    const mutated = await store.patchPurchase({ purchaseId: purchase.id!, action: undefined as any, updateData: { status: "zap", rewardName: "hijack" } })
    expect(mutated.status).toBe("zap")
    expect(mutated.rewardName).toBe("hijack")
    expect(fake.world.purchases[0].status).toBe("zap")
  })
})

describe("updatePurchase cego (QUIRK-8S4)", () => {
  it("escreve status arbitrário sem validação; userId inexistente => P2003", async () => {
    const user = seedUser(100)
    const reward = seedReward({ price: 10 })
    const purchase = await store.createPurchase({ userId: user.id, rewardId: reward.id })

    const blind = await store.updatePurchase(purchase.id!, { status: "qualquer-coisa" })
    expect(blind.status).toBe("qualquer-coisa")
    expect(fake.world.purchases[0].status).toBe("qualquer-coisa")

    const err: any = await store.updatePurchase(purchase.id!, { userId: 999999 }).catch((e) => e)
    expect(err.name).toBe("PrismaClientKnownRequestError")
    expect(err.code).toBe("P2003")
  })

  it("inexistente => 'Compra não encontrada' (update/delete)", async () => {
    await expect(store.updatePurchase(999, { status: "x" })).rejects.toThrow("Compra não encontrada")
    await expect(store.deletePurchase(999)).rejects.toThrow("Compra não encontrada")
  })
})

describe("getPurchase/deletePurchase", () => {
  it("getPurchase inclui user/reward mas o Purchase só expõe escalares; delete remove a linha", async () => {
    const user = seedUser(100)
    const reward = seedReward({ price: 10 })
    const purchase = await store.createPurchase({ userId: user.id, rewardId: reward.id })
    const fetched = await store.getPurchase(purchase.id!)
    expect(fetched).toMatchObject({ id: purchase.id, userId: user.id, rewardId: reward.id, status: "pending" })
    expect((fetched as any).user).toBeUndefined()

    await store.deletePurchase(purchase.id!)
    expect(fake.world.purchases).toHaveLength(0)
  })
})
