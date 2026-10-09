import { prisma } from "@/lib/database/prisma"
import { NotFoundError, ValidationError } from "@/backend/domain"
import type { IPurchase, PurchaseStatus } from "@/backend/domain"
import type { NewPurchase, PurchaseRepository, PurchaseUserRef } from "@/backend/modules/store/application/ports/purchase.repository"

/**
 * OND8-B3 — adapter Prisma fino de `purchases` + pontos (R2).
 * O $transaction legado (QUIRK-8S7) mora aqui: re-check de usuário/points DENTRO da
 * transação com as mensagens verbatim, decrement + create atômicos.
 * `update` escreve as colunas do registro já mesclado pelo use case (merge cego legado —
 * QUIRK-8S4); chaves desconhecidas são ignoradas, como o toPrisma legado fazia.
 * purchaseDate: coluna String ISO (igual ao legado).
 */

interface PurchaseRow {
  id: number
  userId: number
  rewardId: number
  rewardName: string
  price: number
  purchaseDate: string
  status: string
}

function toPurchaseRecord(row: PurchaseRow): IPurchase {
  return {
    id: row.id,
    userId: row.userId,
    rewardId: row.rewardId,
    rewardName: row.rewardName,
    price: row.price,
    purchaseDate: new Date(row.purchaseDate),
    status: row.status as PurchaseStatus,
  }
}

const DESC = { purchaseDate: "desc" as const }

export class PrismaPurchaseRepository implements PurchaseRepository {
  async findById(id: number): Promise<IPurchase | null> {
    const row = await prisma.purchases.findUnique({ where: { id } })
    return row ? toPurchaseRecord(row) : null
  }

  async findAll(): Promise<IPurchase[]> {
    const rows = await prisma.purchases.findMany({ orderBy: DESC })
    return rows.map(toPurchaseRecord)
  }

  async findByUserId(userId: number): Promise<IPurchase[]> {
    const rows = await prisma.purchases.findMany({ where: { userId }, orderBy: DESC })
    return rows.map(toPurchaseRecord)
  }

  async findByRewardId(rewardId: number): Promise<IPurchase[]> {
    const rows = await prisma.purchases.findMany({ where: { rewardId }, orderBy: DESC })
    return rows.map(toPurchaseRecord)
  }

  async findByStatus(status: string): Promise<IPurchase[]> {
    const rows = await prisma.purchases.findMany({ where: { status }, orderBy: DESC })
    return rows.map(toPurchaseRecord)
  }

  async findUserById(userId: number): Promise<PurchaseUserRef | null> {
    return await prisma.users.findUnique({ where: { id: userId }, select: { id: true, name: true, points: true } })
  }

  async createWithPointDeduction(input: NewPurchase): Promise<IPurchase> {
    const created = await prisma.$transaction(async (tx: any) => {
      const currentUser = await tx.users.findUnique({
        where: { id: input.userId },
        select: { id: true, points: true },
      })

      if (!currentUser) {
        throw new NotFoundError("Usuário não encontrado")
      }

      if (currentUser.points < input.price) {
        throw new ValidationError(
          `Pontos insuficientes. Você tem ${currentUser.points} pontos, mas precisa de ${input.price} pontos`,
        )
      }

      await tx.users.update({ where: { id: input.userId }, data: { points: { decrement: input.price } } })

      return await tx.purchases.create({
        data: {
          userId: input.userId,
          rewardId: input.rewardId,
          rewardName: input.rewardName,
          price: input.price,
          purchaseDate: input.purchaseDate.toISOString(),
          status: input.status,
        },
      })
    })

    return toPurchaseRecord(created)
  }

  async update(id: number, merged: IPurchase): Promise<IPurchase> {
    const updated = await prisma.purchases.update({
      where: { id },
      data: {
        userId: merged.userId as never,
        rewardId: merged.rewardId as never,
        rewardName: merged.rewardName as never,
        price: merged.price as never,
        purchaseDate: (merged.purchaseDate instanceof Date
          ? merged.purchaseDate.toISOString()
          : String(merged.purchaseDate)) as never,
        status: merged.status as never,
      },
    })
    return toPurchaseRecord(updated)
  }

  async delete(id: number): Promise<void> {
    await prisma.purchases.delete({ where: { id } })
  }

  async refundPoints(userId: number, amount: number): Promise<void> {
    await prisma.users.update({ where: { id: userId }, data: { points: { increment: amount } } })
  }
}
