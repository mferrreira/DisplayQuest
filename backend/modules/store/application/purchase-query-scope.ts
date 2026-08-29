import type { ListPurchasesQuery } from "@/backend/modules/store/application/contracts"

export interface PurchaseScopeInput {
  actorId: number
  canManagePurchases: boolean
  userId?: string | null
  rewardId?: string | null
  status?: string | null
  startDate?: string | null
  endDate?: string | null
}

export type PurchaseScopeResult =
  | { deny: true; message: string }
  | { deny: false; query: ListPurchasesQuery }

// A2: define o escopo de listagem de compras.
// - Filtros globais (rewardId/status/datas) enumeram compras de TODOS os usuários →
//   exigem MANAGE_PURCHASES (era a falha: qualquer autenticado listava tudo).
// - userId explícito: somente o próprio usuário, ou manager para qualquer um.
// - Sem filtros: manager lista tudo; usuário comum lista apenas as próprias.
// Precedência original das branches é preservada para casos permitidos.
export function resolvePurchaseQueryScope(input: PurchaseScopeInput): PurchaseScopeResult {
  if (input.userId) {
    const targetId = Number(input.userId)
    if (!input.canManagePurchases && (Number.isNaN(targetId) || targetId !== input.actorId)) {
      return { deny: true, message: "Acesso negado" }
    }
    return { deny: false, query: { userId: targetId } }
  }

  if (!input.canManagePurchases) {
    const hasGlobalFilter = Boolean(
      input.rewardId || input.status || (input.startDate && input.endDate),
    )
    if (hasGlobalFilter) {
      return { deny: true, message: "Acesso negado" }
    }
  }

  if (input.rewardId) {
    return { deny: false, query: { rewardId: Number(input.rewardId) } }
  }
  if (input.status) {
    return { deny: false, query: { status: input.status } }
  }
  if (input.startDate && input.endDate) {
    return {
      deny: false,
      query: { startDate: new Date(input.startDate), endDate: new Date(input.endDate) },
    }
  }

  return input.canManagePurchases
    ? { deny: false, query: {} }
    : { deny: false, query: { userId: input.actorId } }
}