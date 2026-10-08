/**
 * daily-log-access — as regras de QUEM LÊ logs diários e sessões (D4, B6-5).
 *
 * Medidas nas rotas legado antes do movimento:
 *  - GET /api/daily_logs: `hasPermission(MANAGE_USERS) || hasRole(LABORATORISTA)` — a MESMA
 *    classe de composta achada no B6-3 (weekly-reports): LABORATORISTA não tem MANAGE_USERS na
 *    matriz, mas vê logs diários. Migra como foi medida (DEC-117), não como FEATURE_ACCESS.
 *  - GET /api/daily_logs/[id]: LABORATORISTA lê qualquer log; senão, self || MANAGE_USERS.
 *  - GET /api/work-sessions: MANAGE_WORK_SESSIONS vê tudo; senão, só as próprias (gate
 *    ensureSelfOrPermission na rota).
 *
 * System actor: bypass declarado (DEC-54) — o único chamador sem pessoa é o cron, e ele só
 * lista sessões (NIGHTLY_SWEEP). Logs diários não têm chamador de sistema medido.
 */
import { hasPermission } from "../identity/has-permission";
import { hasRole } from "../identity/roles";
import type { ActorRef } from "../identity/actor-ref";

/** MANAGE_WORK_SESSIONS (ou system). A leitura do ator substitui o `hasPermission(actorRoles,…)` cru dos use cases. */
export function canActorManageWorkSessions(actor: ActorRef): boolean {
  return actor.kind === "system" || hasPermission(actor.roles, "MANAGE_WORK_SESSIONS");
}

/** A composta medida do GET /api/daily_logs. */
export function canViewAllDailyLogs(actor: ActorRef): boolean {
  return (
    actor.kind === "system" ||
    hasPermission(actor.roles, "MANAGE_USERS") ||
    hasRole(actor.roles, "LABORATORISTA")
  );
}

/** A regra do GET /api/daily_logs/[id]: LABORATORISTA, ou dono, ou MANAGE_USERS. */
export function canReadDailyLog(actor: ActorRef, ownerUserId: number): boolean {
  if (actor.kind === "system") return true;
  if (hasRole(actor.roles, "LABORATORISTA")) return true;
  return actor.id === ownerUserId || hasPermission(actor.roles, "MANAGE_USERS");
}
