import { NotFoundError } from "@/backend/domain"
import {
  assertApprovedForComplete,
  assertNotCompletedForCancel,
  assertPendingForApprove,
  assertPendingForReject,
  assertPurchaseEligibility,
  buildPurchaseSnapshot,
  parsePurchaseRequest,
  resolvePurchaseQueryScope,
  shouldRefundOnCancel,
  shouldRefundOnReject,
} from "@/backend/domain"
import type { IPurchase } from "@/backend/domain"
import type { ListPurchasesResult, ListPurchasesScopeInput } from "@/backend/modules/store/application/contracts"
import type { PurchaseRepository } from "@/backend/modules/store/application/ports/purchase.repository"
import type { RewardRepository } from "@/backend/modules/store/application/ports/reward.repository"

/**
 * OND8-B3 — use cases de purchases (R1). Congelados do StoreServiceGateway legado
 * (golden 8.1):
 *  - listPurchases: precedência mutuamente exclusiva userId > rewardId > status >
 *    datas (filtro em memória, exige AMBAS) > findAll (QUIRK-8S6).
 *  - createPurchase: validação fora e re-check DENTRO da transação (QUIRK-8S7 — o
 *    re-check vive no adapter transacional com as mensagens verbatim).
 *  - updatePurchase: merge CEGO (Object.assign legado — QUIRK-8S4 preservado; o adapter
 *    escreve só as colunas conhecidas, como o toPrisma legado).
 *  - reject reembolsa sempre (QUIRK-8S5); cancel reembolsa pending/approved; refund depois
 *    do update (ordem legada).
 */

export class ListPurchasesUseCase {
  constructor(private readonly purchases: PurchaseRepository) {}

  /**
   * OND8-B4: a RESOLUCAO DE ESCOPO (A2) vive aqui (task OND8-B2 da allow-list).
   * Retorna deny em vez de lancar para a rota preservar o corpo 403 legado exato
   * { error: "Acesso negado" }.
   */
  async execute(input: ListPurchasesScopeInput): Promise<ListPurchasesResult> {
    const scope = resolvePurchaseQueryScope(input)
    if (scope.deny) return { denied: true, message: scope.message }

    const query = scope.query
    if (query.userId) return { denied: false, purchases: await this.purchases.findByUserId(query.userId) }
    if (query.rewardId) return { denied: false, purchases: await this.purchases.findByRewardId(query.rewardId) }
    if (query.status) return { denied: false, purchases: await this.purchases.findByStatus(query.status) }

    if (query.startDate && query.endDate) {
      const all = await this.purchases.findAll()
      return {
        denied: false,
        purchases: all.filter(
          (purchase) => purchase.purchaseDate >= query.startDate! && purchase.purchaseDate <= query.endDate!,
        ),
      }
    }

    return { denied: false, purchases: await this.purchases.findAll() }
  }
}

export class GetPurchaseUseCase {
  constructor(private readonly purchases: PurchaseRepository) {}

  async execute(purchaseId: number) {
    return await this.purchases.findById(purchaseId)
  }
}

export class CreatePurchaseUseCase {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly rewards: RewardRepository,
  ) {}

  async execute(data: Record<string, unknown>) {
    const { userId, rewardId } = parsePurchaseRequest(data)

    const user = await this.purchases.findUserById(userId)
    if (!user) throw new NotFoundError("Usuário não encontrado")

    const reward = await this.rewards.findById(rewardId)
    if (!reward) throw new NotFoundError("Recompensa não encontrada")

    assertPurchaseEligibility(user, reward)

    const snapshot = buildPurchaseSnapshot(userId, reward, new Date())
    return await this.purchases.createWithPointDeduction(snapshot)
  }
}

export class UpdatePurchaseUseCase {
  constructor(private readonly purchases: PurchaseRepository) {}

  async execute(purchaseId: number, data: Record<string, unknown>): Promise<IPurchase> {
    const current = await this.purchases.findById(purchaseId)
    if (!current) throw new NotFoundError("Compra não encontrada")

    // QUIRK-8S4: merge cego preservado (Object.assign legado).
    const merged = { ...current, ...data } as IPurchase
    return await this.purchases.update(purchaseId, merged)
  }
}

export class PatchPurchaseUseCase {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly updatePurchase: UpdatePurchaseUseCase,
  ) {}

  async execute(command: {
    purchaseId: number
    action?: "approve" | "reject" | "deny" | "complete" | "cancel"
    updateData?: Record<string, unknown>
  }): Promise<IPurchase> {
    switch (command.action) {
      case "approve":
        return await this.approve(command.purchaseId)
      case "reject":
      case "deny":
        return await this.reject(command.purchaseId)
      case "complete":
        return await this.complete(command.purchaseId)
      case "cancel":
        return await this.cancel(command.purchaseId)
      default:
        return await this.updatePurchase.execute(command.purchaseId, command.updateData || {})
    }
  }

  private async approve(purchaseId: number): Promise<IPurchase> {
    const purchase = await this.requirePurchase(purchaseId)
    assertPendingForApprove(purchase.status)
    return await this.purchases.update(purchaseId, { ...purchase, status: "approved" })
  }

  private async reject(purchaseId: number): Promise<IPurchase> {
    const purchase = await this.requirePurchase(purchaseId)
    assertPendingForReject(purchase.status)

    const shouldRefund = shouldRefundOnReject(purchase.status)
    const updated = await this.purchases.update(purchaseId, { ...purchase, status: "rejected" })
    if (shouldRefund) {
      await this.purchases.refundPoints(purchase.userId, purchase.price)
    }
    return updated
  }

  private async complete(purchaseId: number): Promise<IPurchase> {
    const purchase = await this.requirePurchase(purchaseId)
    assertApprovedForComplete(purchase.status)
    return await this.purchases.update(purchaseId, { ...purchase, status: "completed" })
  }

  private async cancel(purchaseId: number): Promise<IPurchase> {
    const purchase = await this.requirePurchase(purchaseId)
    assertNotCompletedForCancel(purchase.status)

    const shouldRefund = shouldRefundOnCancel(purchase.status)
    const updated = await this.purchases.update(purchaseId, { ...purchase, status: "cancelled" })
    if (shouldRefund) {
      await this.purchases.refundPoints(purchase.userId, purchase.price)
    }
    return updated
  }

  private async requirePurchase(purchaseId: number): Promise<IPurchase> {
    const purchase = await this.purchases.findById(purchaseId)
    if (!purchase) throw new NotFoundError("Compra não encontrada")
    return purchase
  }
}

export class DeletePurchaseUseCase {
  constructor(private readonly purchases: PurchaseRepository) {}

  async execute(purchaseId: number): Promise<void> {
    const purchase = await this.purchases.findById(purchaseId)
    if (!purchase) throw new NotFoundError("Compra não encontrada")
    await this.purchases.delete(purchaseId)
  }
}
