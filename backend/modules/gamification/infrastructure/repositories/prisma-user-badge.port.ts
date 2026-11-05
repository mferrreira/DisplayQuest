import type { badges, user_badges } from "@prisma/client"
import { prisma } from "@/lib/database/prisma"
import type { Badge, UserBadge } from "@/backend/domain"
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"

/**
 * OND6-B2 (R1) — user-badges. Queries congeladas do UserBadgeRepository legado:
 * orderBy earnedAt desc; findUnique pela chave composta userId_badgeId; earnedAt
 * carimbado no create (o legado carimbava via UserBadge.create). O port recebe o
 * DADO (nao uma instancia com .toPrisma()) — a causa do QUIRK-6A nao e reproduzivel
 * aqui por construcao.
 *
 * plan-v15 S04: `equipped` entra na leitura/escrita, e o findByUserId passa a incluir o
 * badge — a tela de perfil precisa do nome, do criteria e da passiva para renderizar as
 * insignias e os controles de equipar. Aditivo: o shape antigo continua um subconjunto.
 */

function toBadge(row: badges): Badge {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    category: row.category,
    criteria: row.criteria as Badge["criteria"],
    slug: row.slug,
    effect: row.effect as Badge["effect"],
    isActive: row.isActive,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  }
}

function toUserBadge(row: user_badges & { badge?: badges }): UserBadge {
  return {
    id: row.id,
    userId: row.userId,
    badgeId: row.badgeId,
    earnedAt: row.earnedAt,
    earnedBy: row.earnedBy,
    equipped: row.equipped,
    ...(row.badge ? { badge: toBadge(row.badge) } : {}),
  }
}

export function createPrismaUserBadgePort(): UserBadgePort {
  return {
    async findByUserId(userId) {
      const rows = await prisma.user_badges.findMany({
        where: { userId },
        orderBy: [{ earnedAt: "desc" }],
        include: { badge: true },
      })
      return rows.map(toUserBadge)
    },
    async findRecentByUserId(userId, limit) {
      const rows = await prisma.user_badges.findMany({
        where: { userId },
        orderBy: [{ earnedAt: "desc" }],
        take: limit,
        include: { badge: true },
      })
      return rows.map(toUserBadge)
    },
    async findByUserAndBadge(userId, badgeId) {
      const row = await prisma.user_badges.findUnique({
        where: { userId_badgeId: { userId, badgeId } },
        include: { badge: true },
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
    async countEquippedByUserId(userId) {
      return await prisma.user_badges.count({ where: { userId, equipped: true } })
    },
    async setEquipped(id, equipped) {
      const row = await prisma.user_badges.update({ where: { id }, data: { equipped } })
      return toUserBadge(row)
    },
  }
}
