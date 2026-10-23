import type { user_badges } from "@prisma/client"
import { prisma } from "@/lib/database/prisma"
import type { UserBadge } from "@/backend/domain"
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"

/**
 * OND6-B2 (R1) — user-badges. Queries congeladas do UserBadgeRepository legado:
 * orderBy earnedAt desc; findUnique pela chave composta userId_badgeId; earnedAt
 * carimbado no create (o legado carimbava via UserBadge.create). O port recebe o
 * DADO (nao uma instancia com .toPrisma()) — a causa do QUIRK-6A nao e reproduzivel
 * aqui por construcao.
 */

function toUserBadge(row: user_badges): UserBadge {
  return {
    id: row.id,
    userId: row.userId,
    badgeId: row.badgeId,
    // V8-1 (DEC-218) criou a coluna; V8-6 é a onda que a escreve e a lê.
    equipped: row.equipped,
    earnedAt: row.earnedAt,
    earnedBy: row.earnedBy,
  }
}

export function createPrismaUserBadgePort(): UserBadgePort {
  return {
    async findByUserId(userId) {
      const rows = await prisma.user_badges.findMany({
        where: { userId },
        orderBy: { earnedAt: "desc" },
      })
      return rows.map(toUserBadge)
    },
    async findRecentByUserId(userId, limit) {
      const rows = await prisma.user_badges.findMany({
        where: { userId },
        orderBy: { earnedAt: "desc" },
        take: limit,
      })
      return rows.map(toUserBadge)
    },
    async findByUserAndBadge(userId, badgeId) {
      const row = await prisma.user_badges.findUnique({
        where: { userId_badgeId: { userId, badgeId } },
      })
      return row ? toUserBadge(row) : null
    },
    async create(data) {
      const row = await prisma.user_badges.create({
        data: {
          userId: data.userId,
          badgeId: data.badgeId,
          earnedAt: new Date(),
          earnedBy: data.earnedBy ?? null,
        },
      })
      return toUserBadge(row)
    },
    async delete(id) {
      await prisma.user_badges.delete({ where: { id } })
    },
    async countEquipped(userId) {
      return await prisma.user_badges.count({ where: { userId, equipped: true } })
    },
    async findEquippedEffectsByUserId(userId) {
      const rows = await prisma.user_badges.findMany({
        where: { userId, equipped: true },
        select: { badgeId: true, badge: { select: { effects: true } } },
      })
      return rows.map((row) => ({ badgeId: row.badgeId, effects: row.badge.effects }))
    },
    async setEquipped(id, equipped) {
      const row = await prisma.user_badges.update({
        where: { id },
        data: { equipped },
      })
      return toUserBadge(row)
    },
  }
}
