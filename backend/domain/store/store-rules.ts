/**
 * OND8-B2 — regras puras do agregado store (SPEC §4.5, DEC-20).
 *
 * Funções puras extraídas do StoreServiceGateway legado (golden 8.1 como contrato).
 * `now` é sempre parâmetro (nunca lido do relógio dentro do core). Erros tipados com as
 * mensagens legadas VERBATIM (contrato de transporte: contract tests comparam por mensagem,
 * DEC-18). Nenhum import de Prisma/framework/adapter (RG-01).
 *
 * QUIRKS preservados como comportamento de contrato (preservação decidida na onda; ver
 * STATE.json OND8-1-DC1):
 *  - 8S5: reject SEMPRE reembolsa (shouldRefund true por construção — o status já foi
 *    validado como pending antes).
 *  - 8S2: `stock` é campo fantasma (coluna não existe no schema); o check de estoque é
 *    inatingível ("Esta recompensa está fora de estoque" nunca dispara em produção).
 */
import { ConflictError, NotFoundError, ValidationError } from "@/backend/domain/errors"
import type { IReward, PurchaseStatus } from "./Purchase"

export interface RewardInputFields {
  name?: string
  description?: string | null
  price?: number
  available?: boolean
}

/** createReward legado: normaliza e valida (ordem: name, depois price). */
export function normalizeRewardCreate(data: Record<string, unknown>): Required<RewardInputFields> {
  const name = String(data.name || "").trim()
  const price = Number(data.price)
  const description = data.description ? String(data.description) : null
  const available = data.available !== undefined ? Boolean(data.available) : true

  if (!name) {
    throw new ValidationError("Nome da recompensa é obrigatório")
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new ValidationError("Preço deve ser um número não negativo")
  }

  return { name, description, price, available }
}

/**
 * updateReward legado: merge parcial na ordem name -> description -> price -> available.
 * Campos ausentes não entram no patch (o adapter escreve só os presentes).
 */
export function computeRewardUpdateFields(data: Record<string, unknown>): RewardInputFields {
  const fields: RewardInputFields = {}

  if (data.name !== undefined) {
    const name = String(data.name || "").trim()
    if (!name) throw new ValidationError("Nome da recompensa é obrigatório")
    fields.name = name
  }
  if (data.description !== undefined) {
    fields.description = data.description ? String(data.description) : null
  }
  if (data.price !== undefined) {
    const price = Number(data.price)
    if (!Number.isFinite(price) || price < 0) throw new ValidationError("Preço deve ser um número não negativo")
    fields.price = price
  }
  if (data.available !== undefined) {
    fields.available = Boolean(data.available)
  }

  return fields
}

export type RewardPatchAction = "toggle-availability" | "update-price" | "update-name" | "update-description"

/**
 * patchReward legado: actions nomeadas; action desconhecida/ausente aplica updateData
 * (branch default do switch — QUIRK-8S8 preservado).
 */
export function computeRewardPatchFields(
  reward: IReward,
  action: RewardPatchAction | string | undefined,
  updateData: Record<string, unknown> | undefined,
): RewardInputFields {
  switch (action) {
    case "toggle-availability":
      return { available: !reward.available }
    case "update-price": {
      const price = Number(updateData?.price)
      if (!Number.isFinite(price) || price < 0) throw new ValidationError("Preço deve ser um número não negativo")
      return { price }
    }
    case "update-name": {
      const name = String(updateData?.name || "").trim()
      if (!name) throw new ValidationError("Nome da recompensa é obrigatório")
      return { name }
    }
    case "update-description":
      return { description: updateData?.description ? String(updateData.description) : null }
    default:
      return computeRewardUpdateFields(updateData ?? {})
  }
}

/** createPurchase legado: Number() + Number.isInteger (QUIRK: 0 passa do check). */
export function parsePurchaseRequest(data: Record<string, unknown>): { userId: number; rewardId: number } {
  const userId = Number(data.userId)
  const rewardId = Number(data.rewardId)
  if (!Number.isInteger(userId) || !Number.isInteger(rewardId)) {
    throw new ValidationError("userId e rewardId são obrigatórios")
  }
  return { userId, rewardId }
}

/**
 * Elegibilidade na ordem legada: usuário -> recompensa -> available -> stock -> points.
 * O branch de stock é inatingível em produção (8S2), mantido por paridade.
 */
export function assertPurchaseEligibility(user: { points: number } | null, reward: IReward | null): void {
  if (!user) throw new NotFoundError("Usuário não encontrado")
  if (!reward) throw new NotFoundError("Recompensa não encontrada")
  if (!reward.available) throw new ValidationError("Esta recompensa não está disponível")

  const inStock = reward.stock === null || reward.stock === undefined || reward.stock > 0
  if (!inStock) throw new ValidationError("Esta recompensa está fora de estoque")

  if (user.points < reward.price) {
    throw new ValidationError(`Pontos insuficientes. Você tem ${user.points} pontos, mas precisa de ${reward.price} pontos`)
  }
}

/** Snapshot da compra no momento da criação (rewardName/price congelados). */
export function buildPurchaseSnapshot(userId: number, reward: IReward, now: Date): {
  userId: number
  rewardId: number
  rewardName: string
  price: number
  purchaseDate: Date
  status: PurchaseStatus
} {
  return {
    userId,
    rewardId: reward.id as number,
    rewardName: reward.name,
    price: reward.price,
    purchaseDate: now,
    status: "pending",
  }
}

export function assertPendingForApprove(status: string): void {
  if (status !== "pending") throw new ConflictError("Apenas compras pendentes podem ser aprovadas")
}

export function assertPendingForReject(status: string): void {
  if (status !== "pending") throw new ConflictError("Apenas compras pendentes podem ser rejeitadas")
}

export function assertApprovedForComplete(status: string): void {
  if (status !== "approved") throw new ConflictError("Apenas compras aprovadas podem ser completadas")
}

export function assertNotCompletedForCancel(status: string): void {
  if (status === "completed") throw new ConflictError("Compras completadas não podem ser canceladas")
}

/**
 * Reembolso no reject: SEMPRE true (8S5 — `purchase.status === "pending"` é tautologia
 * depois da guarda). Preservado como contrato.
 */
export function shouldRefundOnReject(status: string): boolean {
  return status === "pending"
}

/** Reembolso no cancel: pending/approved sim; rejected/cancelled não (8S5). */
export function shouldRefundOnCancel(status: string): boolean {
  return status === "pending" || status === "approved"
}
