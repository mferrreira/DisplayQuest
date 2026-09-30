/**
 * OND8-B3 — harness compartilhado do contract test store (extraído do golden 8.1; o golden
 * mantém sua cópia inline intacta — DEC-15).
 *
 * Fake Prisma com SEMÂNTICA de schema (rewards sem colunas fantasma -> validação de
 * argumento desconhecido; purchases.purchaseDate String; FKs restrict P2003; users.points
 * decrement/increment; $transaction callback).
 */

export interface StoreWorld {
  users: Array<{ id: number; name: string; points: number; status: string }>
  rewards: Array<{ id: number; name: string; description: string | null; price: number; available: boolean }>
  purchases: Array<{
    id: number
    userId: number
    rewardId: number
    rewardName: string
    price: number
    purchaseDate: string
    status: string
  }>
  seq: { user: number; reward: number; purchase: number }
}

const REWARD_ALLOWED_KEYS = new Set(["name", "description", "price", "available"])
const PURCHASE_ALLOWED_KEYS = new Set(["userId", "rewardId", "rewardName", "price", "purchaseDate", "status"])

function validationError(unknownArg: string) {
  const e: any = new Error(
    `Invalid invocation:\n{\n  data: {\n    ${unknownArg}: null,\n  }\n}\n\nUnknown argument \`${unknownArg}\`. Available options are marked with ?.`,
  )
  e.name = "PrismaClientValidationError"
  return e
}

function fkError(constraint: string) {
  const e: any = new Error(`Foreign key constraint violated on the constraint: \`${constraint}\``)
  e.name = "PrismaClientKnownRequestError"
  e.code = "P2003"
  return e
}

export function createStoreHarness() {
  const world: StoreWorld = { users: [], rewards: [], purchases: [], seq: { user: 1, reward: 1, purchase: 1 } }

  const reset = () => {
    world.users = []
    world.rewards = []
    world.purchases = []
    world.seq = { user: 1, reward: 1, purchase: 1 }
  }

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
        const row = {
          id: world.seq.reward++,
          name: data.name,
          description: data.description ?? null,
          price: data.price,
          available: data.available,
        }
        world.rewards.push(row)
        return { ...row }
      },
      update: async ({ where, data }: any) => {
        assertRewardKeys(data)
        const row = world.rewards.find((r) => r.id === where.id)
        if (!row) throw fkError("rewards_pkey")
        for (const key of Object.keys(data)) if (data[key] !== undefined) (row as any)[key] = data[key]
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
        for (const key of Object.keys(data)) if (data[key] !== undefined) (row as any)[key] = data[key]
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

  const seedUser = (points = 100) => {
    const row = { id: world.seq.user++, name: `U${world.seq.user}`, points, status: "active" }
    world.users.push(row)
    return row
  }
  const seedReward = (
    overrides: Partial<{ name: string; price: number; available: boolean; description: string | null }> = {},
  ) => {
    const row = {
      id: world.seq.reward++,
      name: overrides.name ?? `Reward ${world.seq.reward}`,
      description: overrides.description ?? null,
      price: overrides.price ?? 10,
      available: overrides.available ?? true,
    }
    world.rewards.push(row)
    return row
  }

  const snapshot = () => JSON.parse(JSON.stringify({ users: world.users, rewards: world.rewards, purchases: world.purchases }))

  return { world, prisma, reset, seedUser, seedReward, snapshot }
}

/** Singleton do contract test (importado ANTES dos módulos sob test — padrão TDZ da casa, DEC-18). */
export const storeHarness = createStoreHarness()
