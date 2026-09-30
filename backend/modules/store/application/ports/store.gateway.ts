import type { IPurchase, IReward } from "@/backend/domain"
import type { ListPurchasesQuery, PatchPurchaseCommand, PatchRewardCommand } from "@/backend/modules/store/application/contracts"

/**
 * OND8-B4 (GAP-01 fechado): a porta devolve os read models PUROS do dominio. O gateway
 * legado (seam do golden/contract) continua devolvendo Reward/Purchase instances —
 * estruturalmente atribuíveis. A rota parou de chamar toPrisma() em OND8-B3.
 */
export interface StoreGateway {
  listRewards(): Promise<IReward[]>
  getReward(rewardId: number): Promise<IReward | null>
  createReward(data: Record<string, unknown>): Promise<IReward>
  updateReward(rewardId: number, data: Record<string, unknown>): Promise<IReward>
  patchReward(command: PatchRewardCommand): Promise<IReward>
  deleteReward(rewardId: number): Promise<void>

  listPurchases(query: ListPurchasesQuery): Promise<IPurchase[]>
  getPurchase(purchaseId: number): Promise<IPurchase | null>
  createPurchase(data: Record<string, unknown>): Promise<IPurchase>
  updatePurchase(purchaseId: number, data: Record<string, unknown>): Promise<IPurchase>
  patchPurchase(command: PatchPurchaseCommand): Promise<IPurchase>
  deletePurchase(purchaseId: number): Promise<void>
}
