/**
 * OND8-B2 — escopo de listagem de compras (movido VERBATIM de
 * `backend/modules/store/application/purchase-query-scope.ts` para o domínio puro).
 *
 * A2: define o escopo de listagem de compras.
 * - Filtros globais (rewardId/status/datas) enumeram compras de TODOS os usuários →
 *   exigem MANAGE_PURCHASES (era a falha: qualquer autenticado listava tudo).
 * - userId explícito: somente o próprio usuário, ou manager para qualquer um.
 * - Sem filtros: manager lista tudo; usuário comum lista apenas as próprias.
 * Precedência original das branches é preservada para casos permitidos.
 *
 * O tipo do query é declarado localmente (RG-01: o core não importa contratos de módulo);
 * é estruturalmente idêntico a `ListPurchasesQuery` do módulo.
 *
 * B6-2d (D4): a entrada passou a levar o `ActorRef` em vez do veredito `canManagePurchases`
 * que a ROTA calculava com `hasPermission` e entregava pronto. O veredito pré-calculado era
 * exatamente a dívida do D4 — a decisão morava na rota e o use case só obedecia. A regra
 * agora decide a partir do ator: `user` passa pela matriz de permissões; `system` pode
 * (mesmo bypass declarado de `requireActorPermission`, DEC-54 — medido: nenhuma rotina de
 * sistema chama listPurchases, o ramo existe só para o tipo do ator ser honesto).
 * O deny continua `{ deny, message }` em vez de lançar: é resolução de escopo, não gate
 * único, e preserva o corpo 403 legado EXATO { error: "Acesso negado" } que a rota mapeia.
 */
import { hasPermission, isSystemActor, type ActorRef } from "@/backend/domain/identity";

export interface PurchaseQueryScope {
  userId?: number
  rewardId?: number
  status?: string
  startDate?: Date
  endDate?: Date
}

export interface PurchaseScopeInput {
  actor: ActorRef
  userId?: string | null
  rewardId?: string | null
  status?: string | null
  startDate?: string | null
  endDate?: string | null
}

export type PurchaseScopeResult =
  | { deny: true; message: string }
  | { deny: false; query: PurchaseQueryScope }

export function resolvePurchaseQueryScope(input: PurchaseScopeInput): PurchaseScopeResult {
  const canManagePurchases =
    isSystemActor(input.actor) || hasPermission(input.actor.roles, "MANAGE_PURCHASES")
  // `actorId` só é lido nos ramos em que `canManagePurchases` é false — e esses ramos são
  // inalcançáveis para um system actor (ele sempre pode), então o NaN é unreachable, não rota.
  const actorId = input.actor.kind === "user" ? input.actor.id : Number.NaN

  if (input.userId) {
    const targetId = Number(input.userId)
    if (!canManagePurchases && (Number.isNaN(targetId) || targetId !== actorId)) {
      return { deny: true, message: "Acesso negado" }
    }
    return { deny: false, query: { userId: targetId } }
  }

  if (!canManagePurchases) {
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

  if (canManagePurchases) {
    return { deny: false, query: {} }
  }
  return { deny: false, query: { userId: actorId } }
}
