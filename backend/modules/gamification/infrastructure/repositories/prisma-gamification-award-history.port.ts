import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/database/prisma"
import { DEFAULT_GAMIFICATION_TRACK } from "@/backend/domain"
import type { GamificationAwardHistoryPort } from "@/backend/modules/gamification/application/ports/gamification-award-history.port"

/**
 * OND6-B2 (R1) — idempotencia + award atomico, queries congeladas do gateway legado
 * (:200-261): history.findFirst por descricao; $transaction users.update(increment)
 * + history.create (entityType USER, action GAMIFICATION_AWARD, oldValues JsonNull,
 * newValues/metadata com sourceType/sourceId/pointsAwarded/xpAwarded).
 *
 * V8-1 (DEC-211): a linha passa a declarar a TRILHA do credit (`track`). O caminho inteiro
 * deste arquivo ainda escreve `users.points`, então a trilha declarada é POINTS — a V8-5 muda o
 * destino do prêmio de atividade para `users.coins` (track COINS) e a V8-3 acrescenta o credit
 * de XP (track XP). A idempotência continua a `description`, não o track.
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
            track: DEFAULT_GAMIFICATION_TRACK,
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
