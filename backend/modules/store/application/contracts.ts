export interface ListPurchasesQuery {
  userId?: number
  rewardId?: number
  status?: string
  startDate?: Date
  endDate?: Date
}

/**
 * OND8-B4 — entrada de listPurchases com o ESCOPO do ator (A2): a resolução de escopo
 * (purchase-query-scope) passou a VIVER NO USE CASE (task OND8-B2 da allow-list); a rota
 * nao importa mais caminho interno do modulo.
 */
export interface ListPurchasesScopeInput {
  actorId: number
  canManagePurchases: boolean
  userId?: string | null
  rewardId?: string | null
  status?: string | null
  startDate?: string | null
  endDate?: string | null
}

export type ListPurchasesResult =
  | { denied: true; message: string }
  | { denied: false; purchases: import("@/backend/domain").IPurchase[] }

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
