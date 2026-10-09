/**
 * report-access-rules — a regra composta de acesso a relatórios semanais (D4, B6-3).
 *
 * Medido em 2026-10-08: 4 rotas de weekly-reports decidiam na rota com
 * `hasPermission(roles, "MANAGE_USERS") || hasRole(roles, "LABORATORISTA")` e mensagem
 * própria "Sem permissão" (diferente do default "Acesso negado" dos outros gates — o
 * 403 que o cliente vê hoje tem esse texto, e a migração o preserva). A composição é
 * deliberada: LABORATORISTA NÃO tem MANAGE_USERS na matriz, mas vê e apaga relatórios
 * semanais (é a mesma família de `FEATURE_ACCESS.VIEW_WEEKLY_REPORTS`, declarada para o
 * frontend). Re-expressar o gate como a FEATURE foi considerado e REJEITADO: as duas
 * matrizes hoje coincidem ({COORDENADOR, GERENTE, LABORATORISTA}), mas são vocabulários
 * diferentes e divergiriam na primeira edição de qualquer uma. A regra migra como foi
 * medida — permissão OU papel.
 *
 * O bypass `system` é o declarado do DEC-54. Medido: nenhuma rotina de sistema chama as
 * rotas de weekly-reports; o ramo existe para o tipo do ator ser honesto (e o teste o fixa).
 */
import { ForbiddenError } from "@/backend/domain/errors";
import { hasPermission, hasRole, isSystemActor, type ActorRef } from "@/backend/domain/identity";

/** A mensagem própria das rotas de weekly-reports (`createApiError("Sem permissão", 403)`). */
export const WEEKLY_REPORT_DENIED_MESSAGE = "Sem permissão";

/** Quem vê relatórios de TODO mundo: MANAGE_USERS (COORDENADOR/GERENTE) ou LABORATORISTA. */
export function canViewWeeklyReports(actor: ActorRef): boolean {
  if (isSystemActor(actor)) return true
  return hasPermission(actor.roles, "MANAGE_USERS") || hasRole(actor.roles, "LABORATORISTA")
}

/**
 * "O dono do relatório OU quem vê todos" — o gate de GET/DELETE /weekly-reports/[id] e do
 * userId explícito no GET /weekly-reports. Byte-idêntico à regra medida na rota:
 * `!canViewAllReports && actor.id !== report.userId -> 403 "Sem permissão"`.
 */
export function requireWeeklyReportSelfOrView(
  actor: ActorRef,
  ownerUserId: number,
  message: string = WEEKLY_REPORT_DENIED_MESSAGE,
): void {
  if (isSystemActor(actor)) return
  if (actor.kind === "user" && actor.id === ownerUserId) return
  if (!canViewWeeklyReports(actor)) {
    throw new ForbiddenError(message)
  }
}
