import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/database/prisma"
import type {
  GamificationAwardHistoryPort,
  TaskAwardReversal,
} from "@/backend/modules/gamification/application/ports/gamification-award-history.port"

/**
 * OND6-B2 (R1) — idempotencia + award atomico, queries congeladas do gateway legado
 * (:200-261): history.findFirst por descricao; $transaction users.update(increment)
 * + history.create (entityType USER, action GAMIFICATION_AWARD, oldValues JsonNull,
 * newValues/metadata com sourceType/sourceId/pointsAwarded/xpAwarded).
 */
export function createPrismaGamificationAwardHistoryPort(): GamificationAwardHistoryPort {
  return {
    async hasAward({ userId, description }) {
      const existing = await prisma.history.findFirst({
        where: {
          entityType: "USER",
          entityId: userId,
          action: "GAMIFICATION_AWARD",
          description,
        },
        select: { id: true },
      })
      return Boolean(existing)
    },
    async reverseTaskAward(reversal: TaskAwardReversal) {
      const { userId, taskId, originalAwardDescription, reversalDescription } = reversal

      const original = await prisma.history.findFirst({
        where: {
          entityType: "USER",
          entityId: userId,
          action: "GAMIFICATION_AWARD",
          description: originalAwardDescription,
        },
        select: { id: true, newValues: true },
      })
      // Nada creditado para este par (nunca premiado, ou já liberado por uma reversão) — a
      // transição `done→out` não tem o que deduzir. Devolve null; o evento não toca projects.
      if (!original) return null

      // I3: uma transição deducta uma vez. Se a linha de reversão já está lá, não deducta de novo.
      const alreadyReversed = await prisma.history.findFirst({
        where: {
          entityType: "USER",
          entityId: userId,
          action: "GAMIFICATION_AWARD",
          description: reversalDescription,
        },
        select: { id: true },
      })
      if (alreadyReversed) return null

      const newValues = (original.newValues ?? {}) as { pointsAwarded?: unknown; xpAwarded?: unknown }
      const points = typeof newValues.pointsAwarded === "number" ? newValues.pointsAwarded : 0
      const xp = typeof newValues.xpAwarded === "number" ? newValues.xpAwarded : 0

      await prisma.$transaction(async (tx) => {
        // Dedução sem piso (DEC-39): o saldo pode ficar negativo. `currentMonthPoints` cai junto.
        await tx.users.update({
          where: { id: userId },
          data: {
            points: { decrement: points },
            currentMonthPoints: { decrement: points },
          },
        })

        // A linha original é consumida pela reversão: re-aprovar reencontra o prêmio livre.
        await tx.history.delete({ where: { id: original.id } })

        await tx.history.create({
          data: {
            entityType: "USER",
            entityId: userId,
            action: "GAMIFICATION_AWARD",
            performedBy: userId,
            description: reversalDescription,
            oldValues: Prisma.JsonNull,
            newValues: {
              sourceType: "TASK_REVERSED",
              sourceId: taskId,
              pointsReversed: points,
              xpReversed: xp,
            },
            metadata: {
              domain: "gamification",
              sourceType: "TASK_REVERSED",
              sourceId: taskId,
              pointsReversed: points,
              xpReversed: xp,
            },
          },
        })
      })

      return { reversedPoints: points }
    },
    async awardAndRecord({ userId, sourceType, sourceId, description, pointsAwarded, xpAwarded }) {
      await prisma.$transaction(async (tx) => {
        // plan-v9 (ADR-001, R2, DEC-224): o mesmo premio escreve as duas trilhas, no mesmo tx.
        // `points` e o saldo (loja, badges, ajuste). `currentMonthPoints` e o placar do mes que o
        // Quadro de Lideranca ordena. Escrever uma depois da outra deixaria a pessoa premiada com
        // um quadro que nao sabe do premio.
        await tx.users.update({
          where: { id: userId },
          data: {
            points: {
              increment: pointsAwarded,
            },
            currentMonthPoints: {
              increment: pointsAwarded,
            },
          },
        })

        await tx.history.create({
          data: {
            entityType: "USER",
            entityId: userId,
            action: "GAMIFICATION_AWARD",
            performedBy: userId,
            description,
            oldValues: Prisma.JsonNull,
            newValues: {
              sourceType,
              sourceId,
              pointsAwarded,
              xpAwarded,
            },
            metadata: {
              domain: "gamification",
              sourceType,
              sourceId,
              pointsAwarded,
              xpAwarded,
            },
          },
        })
      })
    },
  }
}
