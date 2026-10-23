import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/database/prisma"
import { COINS_GAMIFICATION_TRACK, POINTS_GAMIFICATION_TRACK, XP_GAMIFICATION_TRACK } from "@/backend/domain"
import type { AwardBalanceTrack } from "@/backend/domain"
import type { GamificationAwardHistoryPort } from "@/backend/modules/gamification/application/ports/gamification-award-history.port"

/**
 * OND6-B2 (R1) — idempotencia + award atomico, queries congeladas do gateway legado
 * (:200-261): history.findFirst por descricao; $transaction users.update(increment)
 * + history.create (entityType USER, action GAMIFICATION_AWARD, oldValues JsonNull,
 * newValues/metadata com sourceType/sourceId e o montante nomeando a trilha da linha).
 *
 * V8-1 (DEC-211): a linha passa a declarar a TRILHA do credit (`track`). O credit de pontos
 * declara POINTS.
 *
 * V8-3 (DEC-214): o bloco `xp` do record escreve a SEGUNDA linha, na MESMA transação —
 * `users.xp` incrementado e `history` com track "XP" e a chave
 * `GAMIFICATION:XP:<sourceType>:<sourceId>`. Duas linhas para duas trilhas, porque uma linha de
 * ledger fala de uma trilha só. A idempotência continua a descrição da fonte do credit: se a
 * fonte já foi creditada, nenhuma das duas trilhas é creditada de novo.
 *
 * V8-5 (DEC-215): a trilha declarada no record escolhe a COLUNA de saldo que recebe o increment —
 * POINTS em `users.points`, COINS em `users.coins` (prêmio de atividade aprovada). A escolha vem do
 * record e não de um if do adaptador decidindo "quem é moeda": é assim que as duas regras não
 * divergem longe do `tsc`.
 */

/** Coluna de saldo de cada trilha de award. XP não entra: XP de award é o bloco `xp` do record. */
const BALANCE_COLUMN: Record<AwardBalanceTrack, "points" | "coins"> = {
  [POINTS_GAMIFICATION_TRACK]: "points",
  [COINS_GAMIFICATION_TRACK]: "coins",
};

/**
 * A chave do montante no JSON do ledger nomeia a trilha da linha — `pointsAwarded` na linha de
 * pontos, `coinsAwarded` na de moeda, do mesmo jeito que a linha de XP nomeia o seu com
 * `xpAwarded`. Linhas anteriores à V8-5 trazem `pointsAwarded` e continuam falando de pontos:
 * é o que a coluna `track` nelas diz.
 */
const LEDGER_AMOUNT_KEY: Record<AwardBalanceTrack, string> = {
  [POINTS_GAMIFICATION_TRACK]: "pointsAwarded",
  [COINS_GAMIFICATION_TRACK]: "coinsAwarded",
};

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
    async awardAndRecord({ userId, sourceType, sourceId, description, amount, track, xp }) {
      const balanceTrack = track ?? POINTS_GAMIFICATION_TRACK
      const amountKey = LEDGER_AMOUNT_KEY[balanceTrack]
      const balanceColumn = BALANCE_COLUMN[balanceTrack]
      const increment = { increment: amount }

      await prisma.$transaction(async (tx) => {
        await tx.users.update({
          where: { id: userId },
          data: balanceColumn === "coins" ? { coins: increment } : { points: increment },
        })

        await tx.history.create({
          data: {
            entityType: "USER",
            entityId: userId,
            action: "GAMIFICATION_AWARD",
            performedBy: userId,
            description,
            track: balanceTrack,
            oldValues: Prisma.JsonNull,
            newValues: {
              sourceType,
              sourceId,
              [amountKey]: amount,
            },
            metadata: {
              domain: "gamification",
              sourceType,
              sourceId,
              [amountKey]: amount,
            },
          },
        })

        if (xp) {
          await tx.users.update({
            where: { id: userId },
            data: {
              xp: {
                increment: xp.amount,
              },
            },
          })

          await tx.history.create({
            data: {
              entityType: "USER",
              entityId: userId,
              action: "GAMIFICATION_AWARD",
              performedBy: userId,
              description: xp.description,
              track: XP_GAMIFICATION_TRACK,
              oldValues: Prisma.JsonNull,
              newValues: {
                sourceType,
                sourceId,
                xpAwarded: xp.amount,
              },
              metadata: {
                domain: "gamification",
                sourceType,
                sourceId,
                xpAwarded: xp.amount,
              },
            },
          })
        }
      })
    },
  }
}
