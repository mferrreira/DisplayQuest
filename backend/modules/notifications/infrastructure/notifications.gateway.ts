/**
 * NotificationsGatewayAdapter — thin adapter implementing the `NotificationsGateway` port on
 * top of the injected `NotificationRepository` (OND1-B2, R2; SPEC §1.2/§1.3, DEC-05).
 *
 * Contains no business rules: recipient normalization and validation live in the use cases;
 * this file only (a) encodes the data envelope exactly as the legacy gateway did (frozen by
 * the golden matrix), (b) resolves ALL_ACTIVE_USERS through the repository when a direct port
 * consumer asks for it, and (c) maps affected-row counts to booleans.
 *
 * Parity with the legacy `PrismaNotificationsGateway` is proved by
 * tests/unit/modules/notifications/notifications.contract.test.ts (R3).
 */
import type {
  NotificationItem,
  PublishNotificationEventCommand,
  PublishNotificationEventResult,
} from "@/backend/modules/notifications/application/contracts"
import type { NotificationsGateway } from "@/backend/modules/notifications/application/ports/notifications.gateway"
import type { NotificationRepository } from "@/backend/modules/notifications/application/ports/notification.repository"

export class NotificationsGatewayAdapter implements NotificationsGateway {
  constructor(private readonly repository: NotificationRepository) {}

  async publishEvent(
    command: PublishNotificationEventCommand,
  ): Promise<PublishNotificationEventResult> {
    const recipients =
      command.audience.mode === "USER_IDS"
        ? command.audience.userIds
        : await this.repository.listActiveUserIds()

    if (recipients.length === 0) {
      return { createdCount: 0, recipients: [] }
    }

    const payloadData = command.data === undefined ? null : JSON.stringify(command.data)

    const createdCount = await this.repository.createMany(
      recipients.map((userId) => ({
        userId,
        type: command.eventType,
        title: command.title,
        message: command.message,
        data: payloadData,
      })),
    )

    return {
      createdCount,
      recipients,
    }
  }

  async listUserNotifications(userId: number, unreadOnly = false): Promise<NotificationItem[]> {
    return await this.repository.listByUser(userId, { unreadOnly })
  }

  async getUnreadCount(userId: number): Promise<number> {
    return await this.repository.countUnread(userId)
  }

  async markAsRead(userId: number, notificationId: number): Promise<boolean> {
    const affected = await this.repository.markRead(userId, notificationId, new Date())
    return affected > 0
  }

  async markAllAsRead(userId: number): Promise<number> {
    return await this.repository.markAllRead(userId, new Date())
  }

  async deleteUserNotification(userId: number, notificationId: number): Promise<boolean> {
    const affected = await this.repository.remove(userId, notificationId)
    return affected > 0
  }
}

export function createNotificationsGatewayAdapter(options: {
  repository: NotificationRepository
}): NotificationsGatewayAdapter {
  return new NotificationsGatewayAdapter(options.repository)
}
