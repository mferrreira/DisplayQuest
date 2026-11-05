import { prisma } from "@/lib/database/prisma"
import type { BadgeEffect } from "@/backend/domain"
import type { EquippedPassivesPort } from "@/backend/modules/gamification/application/ports/equipped-passives.port"

/**
 * plan-v15 S05 (R10): leitura das passivas equipadas pela porta Prisma. Só linhas com
 * `equipped = true` e badge com `effect` não nulo; a ordem é a de conquista (id asc) para
 * que a soma dos pct seja estável.
 */
export function createPrismaEquippedPassivesPort(): EquippedPassivesPort {
  return {
    async listEquippedEffects(userId) {
      const rows = await prisma.user_badges.findMany({
        where: { userId, equipped: true },
        include: { badge: true },
        orderBy: { id: "asc" },
      })
      return rows.map((row) => row.badge.effect).filter((effect) => effect != null) as unknown as BadgeEffect[]
    },
  }
}
