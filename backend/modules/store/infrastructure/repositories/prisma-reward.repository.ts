import { prisma } from "@/lib/database/prisma"
import type { IReward, RewardInputFields } from "@/backend/domain"
import type { RewardRepository } from "@/backend/modules/store/application/ports/reward.repository"

/**
 * OND8-B3 — adapter Prisma fino de `rewards` (R2).
 * DEC-23 (aprovada pelo dono): escreve APENAS colunas reais do schema — o QUIRK-8S1
 * (categoryId/stock/imageUrl fantasma -> PrismaClientValidationError) fica só no gateway
 * legado, que o contract test indexa como seam antigo.
 * Shape JSON congelado (pinado pelo contract 8.3): TODAS as leituras — inclusive create,
 * que o legado re-mapeia com fromPrisma depois do insert — devolvem os campos fantasma null.
 */

interface RewardRow {
  id: number
  name: string
  description: string | null
  price: number
  available: boolean
}

function toRewardRecord(row: RewardRow): IReward {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    available: row.available,
    categoryId: null,
    stock: null,
    imageUrl: null,
  }
}

export class PrismaRewardRepository implements RewardRepository {
  async findById(id: number): Promise<IReward | null> {
    const row = await prisma.rewards.findUnique({ where: { id } })
    return row ? toRewardRecord(row) : null
  }

  async findAll(): Promise<IReward[]> {
    const rows = await prisma.rewards.findMany({ orderBy: { name: "asc" } })
    return rows.map(toRewardRecord)
  }

  async create(input: Required<RewardInputFields>): Promise<IReward> {
    const created = await prisma.rewards.create({
      data: { name: input.name, description: input.description, price: input.price, available: input.available },
    })
    // O legado RewardRepository.create re-mapeia com fromPrisma depois do create — os campos
    // fantasma null ESTÃO na resposta da rota. Shape JSON congelado (contract 8.3 pinou).
    return toRewardRecord(created)
  }

  async update(id: number, fields: RewardInputFields): Promise<IReward> {
    const data: Record<string, unknown> = {}
    if (fields.name !== undefined) data.name = fields.name
    if (fields.description !== undefined) data.description = fields.description
    if (fields.price !== undefined) data.price = fields.price
    if (fields.available !== undefined) data.available = fields.available

    const updated = await prisma.rewards.update({ where: { id }, data: data as never })
    return toRewardRecord(updated)
  }

  async delete(id: number): Promise<void> {
    await prisma.rewards.delete({ where: { id } })
  }
}
