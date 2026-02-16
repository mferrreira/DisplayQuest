import { prisma } from "@/lib/database/prisma"
import { Purchase } from "@/backend/models/Purchase"
import { Reward } from "@/backend/models/Reward"
import { PurchaseRepository } from "@/backend/repositories/PurchaseRepository"
import { RewardRepository } from "@/backend/repositories/RewardRepository"
import type { ListPurchasesQuery, PatchPurchaseCommand, PatchRewardCommand } from "@/backend/modules/store/application/contracts"
import type { StoreGateway } from "@/backend/modules/store/application/ports/store.gateway"

export class StoreServiceGateway implements StoreGateway {
  constructor(
    private readonly rewardRepository: RewardRepository,
    private readonly purchaseRepository: PurchaseRepository,
  ) {}

  async listRewards() {
    return await this.rewardRepository.findAll()
  }

  async getReward(rewardId: number) {
    return await this.rewardRepository.findById(rewardId)
  }

  async createReward(data: Record<string, unknown>) {
    const name = String(data.name || "").trim()
    const price = Number(data.price)
    const description = data.description ? String(data.description) : null
    const available = data.available !== undefined ? Boolean(data.available) : true

    if (!name) {
      throw new Error("Nome da recompensa é obrigatório")
    }

    if (!Number.isFinite(price) || price < 0) {
      throw new Error("Preço deve ser um número não negativo")
    }

    const reward = Reward.create({ name, description, price, available })

    return await this.rewardRepository.create(reward)
  }

  async updateReward(rewardId: number, data: Record<string, unknown>) {
    const currentReward = await this.rewardRepository.findById(rewardId)
    if (!currentReward) {
      throw new Error("Recompensa não encontrada")
    }

    if (data.name !== undefined) {
      const name = String(data.name || "").trim()
      if (!name) throw new Error("Nome da recompensa é obrigatório")
      currentReward.name = name
    }
    if (data.description !== undefined) {
      currentReward.description = data.description ? String(data.description) : null
    }
    if (data.price !== undefined) {
      const price = Number(data.price)
      if (!Number.isFinite(price) || price < 0) throw new Error("Preço deve ser um número não negativo")
      currentReward.price = price
    }
    if (data.available !== undefined) {
      currentReward.available = Boolean(data.available)
    }

    return await this.rewardRepository.update(currentReward)
  }

  async patchReward(command: PatchRewardCommand) {
    const reward = await this.rewardRepository.findById(command.rewardId)
    if (!reward) throw new Error("Recompensa não encontrada")

    switch (command.action) {
      case "toggle-availability": {
        reward.available = !reward.available
        break
      }
      case "update-price": {
        const price = Number(command.updateData?.price)
        if (!Number.isFinite(price) || price < 0) throw new Error("Preço deve ser um número não negativo")
        reward.price = price
        break
      }
      case "update-name": {
        const name = String(command.updateData?.name || "").trim()
        if (!name) throw new Error("Nome da recompensa é obrigatório")
        reward.name = name
        break
      }
      case "update-description": {
        reward.description = command.updateData?.description ? String(command.updateData.description) : null
        break
      }
      default: {
        if (command.updateData?.name !== undefined) {
          const name = String(command.updateData.name || "").trim()
          if (!name) throw new Error("Nome da recompensa é obrigatório")
          reward.name = name
        }
        if (command.updateData?.price !== undefined) {
          const price = Number(command.updateData.price)
          if (!Number.isFinite(price) || price < 0) throw new Error("Preço deve ser um número não negativo")
          reward.price = price
        }
        if (command.updateData?.description !== undefined) {
          reward.description = command.updateData.description ? String(command.updateData.description) : null
        }
        if (command.updateData?.available !== undefined) reward.available = Boolean(command.updateData.available)
      }
    }

    return await this.rewardRepository.update(reward)
  }

  async deleteReward(rewardId: number) {
    const reward = await this.rewardRepository.findById(rewardId)
    if (!reward) throw new Error("Recompensa não encontrada")
    await this.rewardRepository.delete(rewardId)
  }

  async listPurchases(query: ListPurchasesQuery) {
    if (query.userId) return await this.purchaseRepository.findByUserId(query.userId)
    if (query.rewardId) return await this.purchaseRepository.findByRewardId(query.rewardId)
    if (query.status) return await this.purchaseRepository.findByStatus(query.status)

    if (query.startDate && query.endDate) {
      const purchases = await this.purchaseRepository.findAll()
      return purchases.filter(
        (purchase) => purchase.purchaseDate >= query.startDate! && purchase.purchaseDate <= query.endDate!,
      )
    }

    return await this.purchaseRepository.findAll()
  }

  async getPurchase(purchaseId: number) {
    return await this.purchaseRepository.findById(purchaseId)
  }

  async createPurchase(data: Record<string, unknown>) {
    const userId = Number(data.userId)
    const rewardId = Number(data.rewardId)

    if (!Number.isInteger(userId) || !Number.isInteger(rewardId)) {
      throw new Error("userId e rewardId são obrigatórios")
    }

    const user = await this.purchaseRepository.findUserById(userId)
    if (!user) throw new Error("Usuário não encontrado")

    const reward = await this.rewardRepository.findById(rewardId)
    if (!reward) throw new Error("Recompensa não encontrada")

    if (!reward.available) throw new Error("Esta recompensa não está disponível")
    const inStock = reward.stock === null || reward.stock === undefined || reward.stock > 0
    if (!inStock) throw new Error("Esta recompensa está fora de estoque")
    if (user.points < reward.price) {
      throw new Error(`Pontos insuficientes. Você tem ${user.points} pontos, mas precisa de ${reward.price} pontos`)
    }

    const purchase = Purchase.create({
      userId,
      rewardId,
      rewardName: reward.name,
      price: reward.price,
      purchaseDate: new Date(),
      status: "pending",
    })

    const created = await prisma.$transaction(async (tx: any) => {
      const currentUser = await tx.users.findUnique({
        where: { id: userId },
        select: { id: true, points: true },
      })

      if (!currentUser) {
        throw new Error("Usuário não encontrado")
      }

      if (currentUser.points < reward.price) {
        throw new Error(`Pontos insuficientes. Você tem ${currentUser.points} pontos, mas precisa de ${reward.price} pontos`)
      }

      await tx.users.update({
        where: { id: userId },
        data: {
          points: {
            decrement: reward.price,
          },
        },
      })

      return await tx.purchases.create({
        data: purchase.toPrisma(),
        include: { user: true, reward: true },
      })
    })

    return Purchase.fromPrisma(created)
  }

  async updatePurchase(purchaseId: number, data: Record<string, unknown>) {
    const currentPurchase = await this.purchaseRepository.findById(purchaseId)
    if (!currentPurchase) throw new Error("Compra não encontrada")

    Object.assign(currentPurchase, data)

    return await this.purchaseRepository.update(currentPurchase)
  }

  async patchPurchase(command: PatchPurchaseCommand) {
    switch (command.action) {
      case "approve":
        return await this.approvePurchase(command.purchaseId)
      case "reject":
      case "deny":
        return await this.rejectPurchase(command.purchaseId)
      case "complete":
        return await this.completePurchase(command.purchaseId)
      case "cancel":
        return await this.cancelPurchase(command.purchaseId)
      default:
        return await this.updatePurchase(command.purchaseId, command.updateData || {})
    }
  }

  async deletePurchase(purchaseId: number) {
    const purchase = await this.purchaseRepository.findById(purchaseId)
    if (!purchase) throw new Error("Compra não encontrada")
    await this.purchaseRepository.delete(purchaseId)
  }

  private async approvePurchase(id: number) {
    const purchase = await this.purchaseRepository.findById(id)
    if (!purchase) throw new Error("Compra não encontrada")
    if (purchase.status !== "pending") throw new Error("Apenas compras pendentes podem ser aprovadas")
    purchase.status = "approved"
    return await this.purchaseRepository.update(purchase)
  }

  private async rejectPurchase(id: number) {
    const purchase = await this.purchaseRepository.findById(id)
    if (!purchase) throw new Error("Compra não encontrada")
    if (purchase.status !== "pending") throw new Error("Apenas compras pendentes podem ser rejeitadas")

    const shouldRefund = purchase.status === "pending"
    purchase.status = "rejected"
    const updated = await this.purchaseRepository.update(purchase)

    if (shouldRefund) {
      await this.refundPoints(purchase.userId, purchase.price)
    }

    return updated
  }

  private async completePurchase(id: number) {
    const purchase = await this.purchaseRepository.findById(id)
    if (!purchase) throw new Error("Compra não encontrada")
    if (purchase.status !== "approved") throw new Error("Apenas compras aprovadas podem ser completadas")

    purchase.status = "completed"
    return await this.purchaseRepository.update(purchase)
  }

  private async cancelPurchase(id: number) {
    const purchase = await this.purchaseRepository.findById(id)
    if (!purchase) throw new Error("Compra não encontrada")
    if (purchase.status === "completed") throw new Error("Compras completadas não podem ser canceladas")

    const shouldRefund = purchase.status === "pending" || purchase.status === "approved"
    purchase.status = "cancelled"
    const updated = await this.purchaseRepository.update(purchase)

    if (shouldRefund) {
      await this.refundPoints(purchase.userId, purchase.price)
    }

    return updated
  }

  private async refundPoints(userId: number, points: number) {
    await prisma.users.update({
      where: { id: userId },
      data: {
        points: {
          increment: points,
        },
      },
    })
  }
}

export function createStoreGateway() {
  return new StoreServiceGateway(
    new RewardRepository(),
    new PurchaseRepository(),
  )
}
