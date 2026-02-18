export type NotificationAudience =
  | { mode: "USER_IDS"; userIds: number[] }
  | { mode: "ALL_ACTIVE_USERS" }

export interface PublishNotificationEventCommand {
  eventType: string
  title: string
  message: string
  data?: unknown
  audience: NotificationAudience
  triggeredByUserId?: number
}

export interface NotificationItem {
  id: number
  userId: number
  type: string
  title: string
  message: string
  data: unknown
  read: boolean
  createdAt: string
  readAt: string | null
}

export interface PublishNotificationEventResult {
  createdCount: number
  recipients: number[]
}
