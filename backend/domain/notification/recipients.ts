/**
 * Recipient policy — pure domain rule of the notification aggregate (OND1-B2, R2).
 *
 * Moved verbatim out of `PrismaNotificationsGateway.resolveRecipients` (the USER_IDS branch):
 * recipients are deduplicated and only positive integers qualify, keeping first-seen order.
 * The behavior is frozen by the golden matrix (OND1-B1) and re-proved here as a domain rule.
 */
export function normalizeUserIdAudience(userIds: readonly number[]): number[] {
  return [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
}
