import type { ListPurchasesQuery, PatchPurchaseCommand, PatchRewardCommand } from "@/backend/modules/store/application/contracts"
import type { StoreGateway } from "@/backend/modules/store/application/ports/store.gateway"
import { createStoreGateway } from "@/backend/modules/store/infrastructure/store-service.gateway"

export class StoreModule {
  constructor(private readonly gateway: StoreGateway) {}

  async listRewards() {
    return await this.gateway.listRewards()
  }

  async getReward(rewardId: number) {
    return await this.gateway.getReward(rewardId)
  }

  async createReward(data: Record<string, unknown>) {
    return await this.gateway.createReward(data)
  }

  async updateReward(rewardId: number, data: Record<string, unknown>) {
    return await this.gateway.updateReward(rewardId, data)
  }

  async patchReward(command: PatchRewardCommand) {
    return await this.gateway.patchReward(command)
  }

  async deleteReward(rewardId: number) {
    await this.gateway.deleteReward(rewardId)
  }

  async listPurchases(query: ListPurchasesQuery) {
    return await this.gateway.listPurchases(query)
  }

  async getPurchase(purchaseId: number) {
    return await this.gateway.getPurchase(purchaseId)
  }

  async createPurchase(data: Record<string, unknown>) {
    return await this.gateway.createPurchase(data)
  }

  async updatePurchase(purchaseId: number, data: Record<string, unknown>) {
    return await this.gateway.updatePurchase(purchaseId, data)
  }

  async patchPurchase(command: PatchPurchaseCommand) {
    return await this.gateway.patchPurchase(command)
  }

  async deletePurchase(purchaseId: number) {
    await this.gateway.deletePurchase(purchaseId)
  }
}

export function createStoreModule() {
  return new StoreModule(createStoreGateway())
}
