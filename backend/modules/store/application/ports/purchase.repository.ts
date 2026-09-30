import type { IPurchase, PurchaseStatus } from "@/backend/domain"

/**
 * OND8-B3 — porta fina de `purchases` + pontos (R2). Table-level only.
 * `createWithPointDeduction` é o único método transacional: o adapter roda o $transaction
 * legado (re-check de usuário/points dentro da transação — QUIRK-8S7) e propaga os erros
 * tipados com as mensagens verbatim.
 * `update` recebe o registro JÁ MESCLADO pelo use case (merge cego do legado — QUIRK-8S4);
 * o adapter escreve só as colunas conhecidas.
 */
export interface PurchaseUserRef {
  id: number
  name: string
  points: number
}

export interface NewPurchase {
  userId: number
  rewardId: number
  rewardName: string
  price: number
  purchaseDate: Date
  status: PurchaseStatus
}

export interface PurchaseRepository {
  findById(id: number): Promise<IPurchase | null>
  findAll(): Promise<IPurchase[]>
  findByUserId(userId: number): Promise<IPurchase[]>
  findByRewardId(rewardId: number): Promise<IPurchase[]>
  findByStatus(status: string): Promise<IPurchase[]>
  findUserById(userId: number): Promise<PurchaseUserRef | null>
  createWithPointDeduction(input: NewPurchase): Promise<IPurchase>
  update(id: number, merged: IPurchase): Promise<IPurchase>
  delete(id: number): Promise<void>
  refundPoints(userId: number, amount: number): Promise<void>
}
