// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createGamificationModule } from "@/backend/modules/gamification"
import { systemActor } from "@/backend/domain/identity"
import { prisma } from "@/lib/database/prisma"

const gamification = createGamificationModule()
const stamp = Date.now()
const year = 6000 + (stamp % 3000)
const closeAt = new Date(`${year}-08-01T03:00:01.000Z`)
const closedMonth = `${year}-07`
const taskId = 990000 + (stamp % 1000)

let userId = 0
let restoredMonthlyPoints: Array<{ id: number; currentMonthPoints: number }> = []
let safeDatabase = false
let ownsProbeMonth = false

describe("G4 roundtrip — prêmio repetido não volta após fechar o mês", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes(":5433/")) {
      throw new Error("Este teste só pode rodar contra o banco de teste isolado em 127.0.0.1:5433")
    }
    safeDatabase = true

    restoredMonthlyPoints = await prisma.users.findMany({
      select: { id: true, currentMonthPoints: true },
    })
    if (await prisma.board_month_closes.findFirst({ where: { month: closedMonth, track: "MONTH_POINTS" } })) {
      throw new Error(`O mês-sonda ${closedMonth} já está fechado; escolha outra sonda.`)
    }
    ownsProbeMonth = true

    const created = await prisma.users.create({
      data: {
        name: `V9 pós-fechamento ${stamp}`,
        email: `v9-pos-fechamento-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    })
    userId = created.id

    await gamification.awardFromTaskCompletion({ userId, taskId, taskPoints: 30 })
    const result = await gamification.closeBoardMonth({ actor: systemActor("MONTH_CLOSE"), now: closeAt })
    expect(result.month).toBe(closedMonth)
    expect(result.closed).toBe(true)
  })

  afterAll(async () => {
    if (!safeDatabase) return
    if (ownsProbeMonth) {
      await prisma.month_history.deleteMany({ where: { month: closedMonth, track: "MONTH_POINTS" } })
      await prisma.board_month_closes.deleteMany({ where: { month: closedMonth, track: "MONTH_POINTS" } })
    }
    if (userId) {
      await prisma.history.deleteMany({ where: { entityType: "USER", entityId: userId } })
      await prisma.users.delete({ where: { id: userId } })
    }
    for (const row of restoredMonthlyPoints) {
      await prisma.users.updateMany({
        where: { id: row.id },
        data: { currentMonthPoints: row.currentMonthPoints },
      })
    }
  })

  it("repetir o prêmio depois do reset mantém o saldo e não recredita o placar", async () => {
    const closedRows = await prisma.month_history.findMany({
      where: { userId, month: closedMonth, track: "MONTH_POINTS" },
      select: { value: true },
    })
    expect(closedRows).toEqual([{ value: 30 }])

    const repeat = await gamification.awardFromTaskCompletion({ userId, taskId, taskPoints: 30 })
    expect(repeat.alreadyAwarded).toBe(true)
    expect(repeat.pointsAwarded).toBe(0)

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { points: true, currentMonthPoints: true },
    })
    expect(user).toEqual({ points: 30, currentMonthPoints: 0 })
  })
})
