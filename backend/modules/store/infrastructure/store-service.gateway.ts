import { PurchaseRepository } from "@/backend/repositories/PurchaseRepository"
import { RewardRepository } from "@/backend/repositories/RewardRepository"
import { PurchaseService } from "@/backend/services/PurchaseService"
import { RewardService } from "@/backend/services/RewardService"
import type { ListPurchasesQuery, PatchPurchaseCommand, PatchRewardCommand } from "@/backend/modules/store/application/contracts"
import type { StoreGateway } from "@/backend/modules/store/application/ports/store.gateway"

export class StoreServiceGateway implements StoreGateway {
  constructor(
    private readonly rewardService: RewardService,
    private readonly purchaseService: PurchaseService,
  ) {}

  async listRewards() {
    return await this.rewardService.findAll()
  }

  async getReward(rewardId: number) {
    return await this.rewardService.findById(rewardId)
  }

  async createReward(data: Record<string, unknown>) {
    return await this.rewardService.create(data)
  }

  async updateReward(rewardId: number, data: Record<string, unknown>) {
    return await this.rewardService.update(rewardId, data)
  }

  async patchReward(command: PatchRewardCommand) {
    switch (command.action) {
      case "toggle-availability":
        return await this.rewardService.toggleAvailability(command.rewardId)
      case "update-price":
        return await this.rewardService.updatePrice(command.rewardId, Number(command.updateData?.price))
      case "update-name":
        return await this.rewardService.updateName(command.rewardId, String(command.updateData?.name || ""))
      case "update-description":
        return await this.rewardService.updateDescription(
          command.rewardId,
          command.updateData?.description ? String(command.updateData.description) : null,
        )
      default:
        return await this.rewardService.update(command.rewardId, command.updateData || {})
    }
  }

  async deleteReward(rewardId: number) {
    await this.rewardService.delete(rewardId)
  }

  async listPurchases(query: ListPurchasesQuery) {
    if (query.userId) return await this.purchaseService.findByUserId(query.userId)
    if (query.rewardId) return await this.purchaseService.findByRewardId(query.rewardId)
    if (query.status) return await this.purchaseService.findByStatus(query.status)
    if (query.startDate && query.endDate) {
      return await this.purchaseService.searchPurchases({
        startDate: query.startDate,
        endDate: query.endDate,
      })
    }
    return await this.purchaseService.findAll()
  }

  async getPurchase(purchaseId: number) {
    return await this.purchaseService.findById(purchaseId)
  }

  async createPurchase(data: Record<string, unknown>) {
    return await this.purchaseService.create(data)
  }

  async updatePurchase(purchaseId: number, data: Record<string, unknown>) {
    return await this.purchaseService.update(purchaseId, data)
  }

  async patchPurchase(command: PatchPurchaseCommand) {
    switch (command.action) {
      case "approve":
        return await this.purchaseService.approvePurchase(command.purchaseId)
      case "reject":
      case "deny":
        return await this.purchaseService.rejectPurchase(command.purchaseId)
      case "complete":
        return await this.purchaseService.completePurchase(command.purchaseId)
      case "cancel":
        return await this.purchaseService.cancelPurchase(command.purchaseId)
      default:
        return await this.purchaseService.update(command.purchaseId, command.updateData || {})
    }
  }

  async deletePurchase(purchaseId: number) {
    await this.purchaseService.delete(purchaseId)
  }
}

export function createStoreGateway() {
  return new StoreServiceGateway(
    new RewardService(new RewardRepository()),
    new PurchaseService(new PurchaseRepository(), new RewardRepository()),
  )
}
