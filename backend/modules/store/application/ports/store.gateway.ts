import type { Purchase } from "@/backend/models/Purchase"
import type { Reward } from "@/backend/models/Reward"
import type { ListPurchasesQuery, PatchPurchaseCommand, PatchRewardCommand } from "@/backend/modules/store/application/contracts"

export interface StoreGateway {
  listRewards(): Promise<Reward[]>
  getReward(rewardId: number): Promise<Reward | null>
  createReward(data: Record<string, unknown>): Promise<Reward>
  updateReward(rewardId: number, data: Record<string, unknown>): Promise<Reward>
  patchReward(command: PatchRewardCommand): Promise<Reward>
  deleteReward(rewardId: number): Promise<void>

  listPurchases(query: ListPurchasesQuery): Promise<Purchase[]>
  getPurchase(purchaseId: number): Promise<Purchase | null>
  createPurchase(data: Record<string, unknown>): Promise<Purchase>
  updatePurchase(purchaseId: number, data: Record<string, unknown>): Promise<Purchase>
  patchPurchase(command: PatchPurchaseCommand): Promise<Purchase>
  deletePurchase(purchaseId: number): Promise<void>
}
