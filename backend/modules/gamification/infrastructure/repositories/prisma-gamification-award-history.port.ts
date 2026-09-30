import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/database/prisma"
import type { GamificationAwardHistoryPort } from "@/backend/modules/gamification/application/ports/gamification-award-history.port"

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
    async awardAndRecord({ userId, sourceType, sourceId, description, pointsAwarded, xpAwarded }) {
      await prisma.$transaction(async (tx) => {
        await tx.users.update({
          where: { id: userId },
          data: {
            points: {
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
