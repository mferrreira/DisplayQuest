// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const harness = vi.hoisted(() => {
  const updates: Array<Record<string, unknown>> = []
  const purchaseRow = {
    id: 9,
    userId: 42,
    rewardId: 5,
    rewardName: "Caneca",
    price: 20,
    purchaseDate: "2026-10-28T12:00:00.000Z",
    status: "pending",
  }
  const tx = {
    users: {
      findUnique: vi.fn(async () => ({ id: 42, points: 100 })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data)
      }),
    },
    purchases: { create: vi.fn(async () => purchaseRow) },
  }
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    users: { update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => updates.push(data)) },
  }
  return { updates, tx, prisma, reset: () => { updates.length = 0 } }
})

vi.mock("@/lib/database/prisma", () => ({ prisma: harness.prisma }))

import { PrismaPurchaseRepository } from "@/backend/modules/store/infrastructure/repositories/prisma-purchase.repository"

const repository = new PrismaPurchaseRepository()

describe("S11 — loja mantém o saldo separado do placar mensal", () => {
  beforeEach(() => harness.reset())

  it("compra debita apenas users.points", async () => {
    await repository.createWithPointDeduction({
      userId: 42,
      rewardId: 5,
      rewardName: "Caneca",
      price: 20,
      purchaseDate: new Date("2026-10-28T12:00:00.000Z"),
      status: "pending",
    })

    expect(harness.updates).toEqual([{ points: { decrement: 20 } }])
    expect(harness.updates[0]).not.toHaveProperty("currentMonthPoints")
  })

  it("estorno credita apenas users.points", async () => {
    await repository.refundPoints(42, 20)

    expect(harness.updates).toEqual([{ points: { increment: 20 } }])
    expect(harness.updates[0]).not.toHaveProperty("currentMonthPoints")
  })
})
