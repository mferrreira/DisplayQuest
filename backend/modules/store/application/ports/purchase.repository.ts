import type { IPurchase, PurchaseStatus } from "@/backend/domain"

/**
 * OND8-B3 — porta fina de `purchases` + saldo (R2). Table-level only.
 * `createWithCoinDeduction` é o único método transacional: o adapter roda o $transaction
 * legado (re-check de usuário e de saldo dentro da transação — QUIRK-8S7) e propaga os erros
 * tipados com as mensagens verbatim.
 *
 * plan-v8 V8-5 (DEC-215/216): o saldo da loja é moeda. Cobrança e estorno acontecem em
 * `users.coins`; `rewards.price` continua o mesmo número (virada 1:1 do V8-CLOSE).
 * `update` recebe o registro JÁ MESCLADO pelo use case (merge cego do legado — QUIRK-8S4);
 * o adapter escreve só as colunas conhecidas.
 */
export interface PurchaseUserRef {
  id: number
  name: string
  coins: number
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
  createWithCoinDeduction(input: NewPurchase): Promise<IPurchase>
  update(id: number, merged: IPurchase): Promise<IPurchase>
  delete(id: number): Promise<void>
  refundCoins(userId: number, amount: number): Promise<void>
}
