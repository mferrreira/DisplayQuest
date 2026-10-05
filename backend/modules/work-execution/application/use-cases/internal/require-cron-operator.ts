import { ForbiddenError, hasPermission } from "@/backend/domain"

/**
 * Cron operator gate (B6-1b, D4) — the rule that used to live in
 * `app/api/cron/status/route.ts` as `ensurePermission(auth.actor, "MANAGE_USERS", ...)`.
 *
 * The message is FROZEN: it is the exact string the route returned in the 403 body, and
 * `tests/unit/api/cron-status-roles.test.ts` pins it.
 *
 * Permission, not a role list (DEC-51): COORDENADOR and GERENTE have identical permissions in
 * `backend/domain/identity/permissions.ts`, so listing one of them was denying an equally
 * authorised actor — the same mistake the sibling routes (`/api/weekly-hours-history`,
 * `/api/projects/stats`) never made, because they gate on MANAGE_USERS.
 */
export const CRON_FORBIDDEN_MESSAGE = "Apenas coordenadores e gerentes podem acessar."

/**
 * Throws `ForbiddenError` unless the actor may operate the scheduler.
 *
 * `actorRoles` is `unknown` on purpose: it comes straight from the session, and the domain's
 * `hasPermission` is documented never to throw on dirty input.
 */
export function requireCronOperator(actorRoles: unknown): void {
  if (!hasPermission(actorRoles, "MANAGE_USERS")) {
    throw new ForbiddenError(CRON_FORBIDDEN_MESSAGE)
  }
}