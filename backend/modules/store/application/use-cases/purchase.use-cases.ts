import {
  assertApprovedForComplete,
  assertNotCompletedForCancel,
  assertPendingForApprove,
  assertPendingForReject,
  assertPurchaseEligibility,
  buildPurchaseSnapshot,
  NotFoundError,
  parsePurchaseRequest,
  requireActorPermission,
  requireActorSelfOrPermission,
  resolvePurchaseQueryScope,
  shouldRefundOnCancel,
  shouldRefundOnReject,
  ValidationError,
} from "@/backend/domain"
import type { ActorRef, IPurchase } from "@/backend/domain"
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
 *
 * B6-2d (D4, DEC-53) — os seis use cases de compra passaram a RECEBER o ator. Medido antes
 * de mexer: nenhum deles tem chamador interno (só as duas rotas de purchases), e a regra da
 * rota POST é CROSS-ACTOR (`!canManagePurchases && targetUserId !== actor.id`): o que exige
 * MANAGE_PURCHASES é comprar PARA OUTRO, não comprar — um VOLUNTARIO comprando para si passa
 * (201) e quem barra é a elegibilidade. É `requireActorSelfOrPermission` (DEC-115), não o gate
 * puro. As ORDENS medidas por método foram preservadas uma a uma:
 *  - POST: 400 "userId inválido" (validação de entrada, fica na rota — precede o gate hoje)
 *    → 403 do gate → parse do rewardId (400) → 404s → elegibilidade (400).
 *  - GET [id]: 404 antes do 403 (a compra é lida primeiro; o dono decide depois).
 *  - PUT/DELETE: 403 antes de 404 (gate antes de qualquer leitura).
 *  - PATCH: 404 antes do gate; gate por AÇÃO — cancel é self-or-manage (o dono cancela a
 *    própria compra), approve/reject/complete exigem MANAGE_PURCHASES até para o dono.
 */

export class ListPurchasesUseCase {
  constructor(private readonly purchases: PurchaseRepository) {}

  /**
   * OND8-B4: a RESOLUCAO DE ESCOPO (A2) vive aqui (task OND8-B2 da allow-list).
   * Retorna deny em vez de lancar para a rota preservar o corpo 403 legado exato
   * { error: "Acesso negado" }. B6-2d: a entrada leva o ActorRef — a regra decide a partir
   * do ator em vez de receber o veredito `canManagePurchases` que a rota calculava.
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

  /**
   * B6-2d: leitura de UMA compra — 404 primeiro (a compra é buscada antes de decidir quem é
   * o dono; ordem medida na rota), depois self-or-manage. Devolve `null` em vez de lancar no
   * 404 para a rota preservar o corpo legado { error: "Compra não encontrada" } (pinnado em
   * mapped-routes.test.ts: "GET sem purchase (null) -> 404 legado preservado").
   */
  async execute(actor: ActorRef, purchaseId: number): Promise<IPurchase | null> {
    const purchase = await this.purchases.findById(purchaseId)
    if (!purchase) return null
    requireActorSelfOrPermission(actor, purchase.userId, "MANAGE_PURCHASES")
    return purchase
  }
}

/**
 * B6-2b (AssertCanPublishNotificationEventUseCase) — o mesmo padrão, para o PUT: o gate legado
 * rodava ANTES de o corpo ser lido. Com o gate dentro de `updatePurchase`, a rota precisaria
 * parsear o corpo antes de chamar o use case, e um corpo inválido daria 500 a quem não tem
 * permissão (hoje dá 403). A rota autoriza aqui antes de ler o corpo; `updatePurchase`
 * recheca no próprio ator.
 */
export class AssertCanManagePurchasesUseCase {
  execute(command: { actor: ActorRef }): void {
    requireActorPermission(command.actor, "MANAGE_PURCHASES")
  }
}

export class CreatePurchaseUseCase {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly rewards: RewardRepository,
  ) {}

  /**
   * Ordem medida (B6-0, caraterização): a validação de `userId` (400 "userId inválido") vem
   * ANTES do 403 — fica na rota, é validação de entrada, não autorização. Aqui: gate
   * cross-actor primeiro (comprar PARA OUTRO exige MANAGE_PURCHASES; para si, qualquer
   * autenticado passa), depois o parse completo (rewardId inválido é 400 DEPOIS do 403 —
   * ordem pinnada em purchases-authorization.test.ts), depois os 404s e a elegibilidade.
   */
  async execute(command: { actor: ActorRef; data: Record<string, unknown> }) {
    const targetUserId = Number(command.data.userId)
    requireActorSelfOrPermission(command.actor, targetUserId, "MANAGE_PURCHASES")

    const { userId, rewardId } = parsePurchaseRequest(command.data)

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

  /** Gate puro ANTES da leitura (ordem medida: PUT barrava antes mesmo de existir compra). */
  async execute(command: { actor: ActorRef; purchaseId: number; data: Record<string, unknown> }): Promise<IPurchase> {
    requireActorPermission(command.actor, "MANAGE_PURCHASES")

    const current = await this.purchases.findById(command.purchaseId)
    if (!current) throw new NotFoundError("Compra não encontrada")

    // QUIRK-8S4: merge cego preservado (Object.assign legado).
    const merged = { ...current, ...command.data } as IPurchase
    return await this.purchases.update(command.purchaseId, merged)
  }
}

export class PatchPurchaseUseCase {
  constructor(
    private readonly purchases: PurchaseRepository,
    private readonly updatePurchase: UpdatePurchaseUseCase,
  ) {}

  /**
   * Ordem medida: a compra é lida primeiro (404 "Compra não encontrada" antes do 403), e o
   * gate depende da AÇÃO — `cancel` é self-or-manage (o dono cancela a própria compra),
   * qualquer outra ação exige MANAGE_PURCHASES até para o dono. O gate vem antes das asserções
   * de status (400/409), como na rota.
   */
  async execute(command: {
    actor: ActorRef
    purchaseId: number
    action?: "approve" | "reject" | "deny" | "complete" | "cancel"
    updateData?: Record<string, unknown>
  }): Promise<IPurchase> {
    const purchase = await this.requirePurchase(command.purchaseId)
    if (command.action === "cancel") {
      requireActorSelfOrPermission(command.actor, purchase.userId, "MANAGE_PURCHASES")
    } else {
      requireActorPermission(command.actor, "MANAGE_PURCHASES")
    }

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
        return await this.updatePurchase.execute({
          actor: command.actor,
          purchaseId: command.purchaseId,
          data: command.updateData || {},
        })
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

  /** Gate puro ANTES da leitura (ordem medida: DELETE barrava antes mesmo de existir compra). */
  async execute(command: { actor: ActorRef; purchaseId: number }): Promise<void> {
    requireActorPermission(command.actor, "MANAGE_PURCHASES")

    const purchase = await this.purchases.findById(command.purchaseId)
    if (!purchase) throw new NotFoundError("Compra não encontrada")
    await this.purchases.delete(command.purchaseId)
  }
}
