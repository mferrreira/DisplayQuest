import { Prisma } from "@prisma/client"
import type { badges } from "@prisma/client"
import { prisma } from "@/lib/database/prisma"
import type { Badge, BadgeCategory, BadgeCriteria } from "@/backend/domain"
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port"

/**
 * OND6-B2 (R1) — CRUD de badges mapeando a linha Prisma para o contract PURO `Badge`.
 * Queries congeladas do BadgeRepository legado: orderBy createdAt desc; criteria null
 * gravado como Prisma.JsonNull (coluna Json). O include creator/userBadges do legado
 * NAO era lido por nenhum consumidor (Badge.fromPrisma so le escalares) — cortado.
 */

function toBadge(row: badges): Badge {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    category: row.category as BadgeCategory,
    criteria: (row.criteria as BadgeCriteria | null) ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  }
}

function criteriaForWrite(criteria: BadgeCriteria | null | undefined): Prisma.InputJsonValue {
  return criteria == null ? (Prisma.JsonNull as unknown as Prisma.InputJsonValue) : (criteria as Prisma.InputJsonValue)
}

export function createPrismaBadgeCatalogPort(): BadgeCatalogPort {
  return {
    async findAll() {
      const rows = await prisma.badges.findMany({ orderBy: { createdAt: "desc" } })
      return rows.map(toBadge)
    },
    async findById(id) {
      const row = await prisma.badges.findUnique({ where: { id } })
      return row ? toBadge(row) : null
    },
    async findActive() {
      const rows = await prisma.badges.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      })
      return rows.map(toBadge)
    },
    async findByCategory(category) {
      const rows = await prisma.badges.findMany({
        where: { category },
        orderBy: { createdAt: "desc" },
      })
      return rows.map(toBadge)
    },
    async create(data) {
      const row = await prisma.badges.create({
        data: {
          name: data.name,
          description: data.description,
          icon: data.icon ?? null,
          color: data.color ?? null,
          category: data.category,
          criteria: criteriaForWrite(data.criteria),
          isActive: data.isActive,
          createdBy: data.createdBy,
        },
      })
      return toBadge(row)
    },
    async update(badge) {
      const row = await prisma.badges.update({
        where: { id: badge.id! },
        data: {
          name: badge.name,
          description: badge.description,
          icon: badge.icon ?? null,
          color: badge.color ?? null,
          category: badge.category,
          criteria: criteriaForWrite(badge.criteria),
          isActive: badge.isActive,
          createdBy: badge.createdBy,
        },
      })
      return toBadge(row)
    },
    async delete(id) {
      await prisma.badges.delete({ where: { id } })
    },
  }
}
