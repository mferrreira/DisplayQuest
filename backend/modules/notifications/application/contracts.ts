/**
 * Notifications contracts (OND1-B1, R1): the vocabulary types now LIVE in `backend/domain`
 * (SPEC §4.5) and are re-exported here under the names the ports and adapters already use —
 * zero reshaping (DEC-12). The command/result stay application DTOs.
 */
import type { Notification, NotificationAudience } from "@/backend/domain";

export type { NotificationAudience } from "@/backend/domain";

/** Same name, same shape; the pure definition moved to backend/domain/notification. */
export type NotificationItem = Notification;

export interface PublishNotificationEventCommand {
  eventType: string
  title: string
  message: string
  data?: unknown
  audience: NotificationAudience
  triggeredByUserId?: number
}

export interface PublishNotificationEventResult {
  createdCount: number
  recipients: number[]
}
