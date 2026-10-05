/**
 * Notifications contracts (OND1-B1, R1): the vocabulary types now LIVE in `backend/domain`
 * (SPEC §4.5) and are re-exported here under the names the ports and adapters already use —
 * zero reshaping (DEC-12). The command/result stay application DTOs.
 */
import type { ActorRef, Notification, NotificationAudience } from "@/backend/domain";

export type { ActorRef, NotificationAudience } from "@/backend/domain";

/** Same name, same shape; the pure definition moved to backend/domain/notification. */
export type NotificationItem = Notification;

export interface PublishNotificationEventCommand {
  eventType: string
  title: string
  message: string
  data?: unknown
  audience: NotificationAudience
  triggeredByUserId?: number
  /**
   * Who is publishing (D4, B6-2b, DEC-54). Required, not optional: `PublishNotificationEventUseCase`
   * has three callers with different authorisation — the route (`userActor`, checked against
   * MANAGE_NOTIFICATIONS) and two internal publishers for lab issues and submitted reports
   * (`systemActor("SYSTEM_EVENT")`, no person behind them). Making it optional would be fail-open:
   * a caller that forgot the field would silently publish without a permission check.
   */
  actor: ActorRef
}

export interface PublishNotificationEventResult {
  createdCount: number
  recipients: number[]
}
