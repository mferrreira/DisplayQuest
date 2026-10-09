import { requireActorPermission } from "@/backend/domain"
import type { ActorRef } from "@/backend/domain"

/**
 * AssertCanManageUserBadgesUseCase — authorisation only, no award (D4, B6-2c).
 *
 * This exists for the same reason `AssertCanPublishNotificationEventUseCase` does (B6-2b):
 * `POST /api/user-badges` and `DELETE /api/user-badges/[userId]/[badgeId]` cannot simply move
 * their gate down without changing an observable behaviour, because both validate input AFTER
 * the gate today:
 *
 *   - POST: gate → `request.json()` → 400 "badgeId e userId são obrigatórios";
 *   - DELETE: gate → `context.params` → 400 "Parâmetros inválidos".
 *
 * Left that way, the gate descending alone would run after those 400s and a caller with no
 * MANAGE_USERS sending an invalid body would get 400 instead of the 403 they get today. For the
 * POST the obstacle is stronger: the body has to be READ before it can be validated, and today
 * an unreadable body from an unauthorised caller is a 403, not a 500.
 *
 * So the route calls this first — before it reads anything — and then calls `awardBadge` /
 * `removeUserBadge`, which assert again on their own `actor`. The second assert is not
 * redundant: it is what keeps those use cases safe for a caller that is not this route.
 * `tests/unit/api/user-badges-authorization.test.ts` pins the order for both routes.
 */
export class AssertCanManageUserBadgesUseCase {
  async execute(command: { actor: ActorRef }): Promise<void> {
    requireActorPermission(command.actor, "MANAGE_USERS")
  }
}
