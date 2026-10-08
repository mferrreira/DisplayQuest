/**
 * ActorRef — WHO is acting on a command that reaches a use case (D4, B6-2b, DEC-54).
 *
 * Why this exists. D4 is moving 41 authorisation decisions out of the route layer and into the
 * use cases underneath. Most of those use cases have a single caller: a route, acting on behalf
 * of a person whose roles came from the session. Four of them do not:
 *
 *   - `PublishNotificationEventUseCase` is also called by two INTERNAL publishers — the lab
 *     issue event and the report-submitted event. Those are the system describing something that
 *     already happened; there is no person to hold a role.
 *   - `workExecution.listWorkSessions`, `labOperations.pauseResponsibilityForUser` and
 *     `reporting.resetWeeklyHoursHistory` are also called by `lib/services/cron-service.ts`: the
 *     anti-farm nightly sweep, the scheduled pause and the weekly hours reset.
 *
 * So the same use case serves two audiences with genuinely different authorisation rules. There
 * are three ways to reconcile that, and two of them are holes:
 *
 *   - gate inside the use case with no actor concept: breaks every system caller with a 403,
 *     i.e. silently stops notifying about lab issues and submitted reports;
 *   - gate inside the use case with `actorRoles` OPTIONAL and "absent means system": fail-open.
 *     Any future caller that forgets the field skips the check, and nothing complains. That is
 *     the exact hole D4 exists to close, just moved.
 *
 * This is the third way: the caller must say which it is, and the type is what says it. There is
 * no default, so there is nothing to forget — a command without an `actor` does not compile.
 *
 * `systemActor(reason)` IS a bypass, and it is meant to be: a scheduled sweep has no meaningful
 * permission to hold, so inventing `SYSTEM_SWEEP` as a grant would be ceremony without security.
 * What makes it safe is that it cannot be reached from a request: `userActor` is what every route
 * builds, always from `auth.actor.id` + `auth.actor.roles`, and
 * `tests/unit/domain/identity/system-actor.test.ts` greps `app/api/**` to fail the build if a
 * route ever calls `systemActor`. The `reason` is a LABEL, not a runtime check — it is not
 * consulted while deciding anything. It exists so the
 * bypass is auditable: five call sites, each with a test naming it.
 *
 * B6-2c (DEC-115) added `id` to the `user` variant: `GET /api/users/[id]/gamification` moved a
 * self-or-manage gate into its use case, and "self" is a comparison of ids — without `id` on the
 * actor that rule could only be answered in the route, which is the place D4 is emptying.
 */
/** The system routines that legitimately reach a use case with no person behind them. */
export const SYSTEM_REASONS = {
  /** `cron-service.ts` — anti-farm sweep: closes work sessions left open overnight/weekend. */
  NIGHTLY_SWEEP: "NIGHTLY_SWEEP",
  /** `cron-service.ts` — pauses a responsibility whose scheduled window ended. */
  SCHEDULED_PAUSE: "SCHEDULED_PAUSE",
  /** `cron-service.ts` — resets last week's hours history. */
  WEEKLY_RESET: "WEEKLY_RESET",
  /** An internal publisher describing an event that already happened (lab issue, report). */
  SYSTEM_EVENT: "SYSTEM_EVENT",
} as const;

export type SystemReason = (typeof SYSTEM_REASONS)[keyof typeof SYSTEM_REASONS];

export type ActorRef =
  /** A person, identified by the id their session carried and by its roles. `roles` is
   *  `unknown` on purpose: it arrives straight from the session and `hasPermission` is
   *  documented never to throw on dirty input. `id` is what makes the *self* half of
   *  self-or-manage expressible (`requireActorSelfOrPermission`) — B6-2c, DEC-115. */
  | { readonly kind: "user"; readonly id: number; readonly roles: unknown }
  | { readonly kind: "system"; readonly reason: SystemReason };

/** The route-side constructor. `id` and `roles` come from the session and from nowhere else. */
export function userActor(id: number, roles: unknown): ActorRef {
  return { kind: "user", id, roles };
}

/** The system-side constructor. Never call this from a route — a test fails the build if you do. */
export function systemActor(reason: SystemReason): ActorRef {
  return { kind: "system", reason };
}

/** Narrowing helper for the two publishers, which accept a command from either audience. */
export function isSystemActor(actor: ActorRef): actor is { readonly kind: "system"; readonly reason: SystemReason } {
  return actor.kind === "system";
}