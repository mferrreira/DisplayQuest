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