/**
 * assertPermission — the typed form of the guard the routes used to run (D4, B6-2a).
 *
 * `hasPermission` answers a question; this one enforces an answer. It exists because 41 routes
 * were deciding authorisation in the route layer with `ensurePermission` (which returns a 403
 * `Response`), and the use cases underneath them checked no actor at all. Moving each gate into
 * its use case means the rule is now asserted, not answered.
 *
 * Default message "Acesso negado" — the exact string both sides used before: `ensurePermission`'s
 * default parameter and `ForbiddenError`'s. Routes that passed no message (the rewards family)
 * keep byte-identical 403 bodies; the ones that passed a message keep theirs.
 *
 * The 403 body changes shape when a gate moves here, and that is deliberate (DEC-53): the route
 * guard returned `{ error }` via `createApiError`, while a `ForbiddenError` goes through
 * `domainErrorResponse` and returns `{ error, code, details }`. The status and the message are
 * untouched — it is the superset this codebase already documents (OND8-B4) and already serves on
 * the 20 routes that were in the correct shape. After D4 every 403 in the system has one shape.
 *
 * `userRoles` is `unknown` on purpose: it arrives straight from the session, and `hasPermission`
 * is documented never to throw on dirty input (unknown role → denial, not an exception).
 */
import { ForbiddenError } from "../errors";
import type { ActorRef } from "./actor-ref";
import { hasAnyRole, type Role } from "./roles";
import { hasPermission } from "./has-permission";
import type { Permission } from "./permissions";

/** The message both `ensurePermission` and `ForbiddenError` used before this helper existed. */
export const ACCESS_DENIED_MESSAGE = "Acesso negado";

export function assertPermission(
  userRoles: unknown,
  permission: Permission,
  message: string = ACCESS_DENIED_MESSAGE,
): void {
  if (!hasPermission(userRoles, permission)) {
    throw new ForbiddenError(message);
  }
}

/**
 * requireActorPermission — the same rule as `assertPermission`, for a command that arrives with an
 * `ActorRef` (D4, B6-2b, DEC-54).
 *
 * A `user` actor goes through `assertPermission` unchanged. A `system` actor passes, because a
 * scheduled sweep has no role to hold and inventing a permission for it would be a grant that
 * nobody can revoke. That bypass is deliberate and narrow: see `actor-ref.ts` for why it is
 * typed, why it is not forgeable from a request, and what test enforces that.
 *
 * Prefer this over calling `isSystemActor` at the call site: the check belongs to the rule, so a
 * use case cannot forget it by omitting an `if`.
 */
export function requireActorPermission(
  actor: ActorRef,
  permission: Permission,
  message: string = ACCESS_DENIED_MESSAGE,
): void {
  if (actor.kind === "system") return;
  assertPermission(actor.roles, permission, message);
}

/**
 * requireActorSelfOrPermission — "age em si mesmo OU tem a permissão" (D4, B6-2c, DEC-115).
 *
 * The typed form of `ensureSelfOrPermission`, which 7 routes still answer themselves and which
 * already delegated to `identityAccess().canAccessSelfOrPermission`. The rule is byte-identical
 * to the gateway it replaces: `actor.id === ownerUserId` passes, otherwise the permission decides
 * (`rbac-identity-access.gateway.ts:15-21`). What changed is only where it lives — a route can no
 * longer read the answer without going through this function.
 *
 * `actor.id` is why the `user` variant of `ActorRef` carries an id: "self" is a comparison, and
 * the comparison belongs to the person's identity, which the route builds from the session and
 * hands over. A `system` actor passes, like in `requireActorPermission` — there is no person to
 * be "self", and the bypass is the same declared one (see `actor-ref.ts`).
 */
export function requireActorSelfOrPermission(
  actor: ActorRef,
  ownerUserId: number,
  permission: Permission,
  message: string = ACCESS_DENIED_MESSAGE,
): void {
  if (actor.kind === "system") return;
  if (actor.id === ownerUserId) return;
  assertPermission(actor.roles, permission, message);
}

/**
 * requireActorAnyRole — a forma tipada de `ensureAnyRole` (D4, B6-6). A decisao e sobre PAPEIS
 * (nao permissao): os gates de responsabilidades do laboratorio sao listas de papel na rota
 * legado. System passa (bypass declarado, DEC-54) — o que barra rota e o guarda system-actor.
 */
export function requireActorAnyRole(
  actor: ActorRef,
  roles: readonly string[],
  message: string = ACCESS_DENIED_MESSAGE,
): void {
  if (actor.kind === "system") return;
  if (!hasAnyRole(actor.roles, roles as Role[])) {
    throw new ForbiddenError(message);
  }
}