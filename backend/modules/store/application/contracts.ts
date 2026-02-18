export interface ListPurchasesQuery {
  userId?: number
  rewardId?: number
  status?: string
  startDate?: Date
  endDate?: Date
}

export interface PatchPurchaseCommand {
  purchaseId: number
  action?: "approve" | "reject" | "deny" | "complete" | "cancel"
  updateData?: Record<string, unknown>
}

export interface PatchRewardCommand {
  rewardId: number
  action?: "toggle-availability" | "update-price" | "update-name" | "update-description"
  updateData?: Record<string, unknown>
}
