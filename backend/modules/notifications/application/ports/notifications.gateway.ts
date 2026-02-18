import type {
  NotificationItem,
  PublishNotificationEventCommand,
  PublishNotificationEventResult,
} from "@/backend/modules/notifications/application/contracts"

export interface NotificationsGateway {
  publishEvent(command: PublishNotificationEventCommand): Promise<PublishNotificationEventResult>
  listUserNotifications(userId: number, unreadOnly?: boolean): Promise<NotificationItem[]>
  getUnreadCount(userId: number): Promise<number>
  markAsRead(userId: number, notificationId: number): Promise<boolean>
  markAllAsRead(userId: number): Promise<number>
  deleteUserNotification(userId: number, notificationId: number): Promise<boolean>
}
