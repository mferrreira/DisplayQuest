import { prisma } from "@/lib/database/prisma"
import type {
  NotificationItem,
  PublishNotificationEventCommand,
  PublishNotificationEventResult,
} from "@/backend/modules/notifications/application/contracts"
import type { NotificationsGateway } from "@/backend/modules/notifications/application/ports/notifications.gateway"

export class PrismaNotificationsGateway implements NotificationsGateway {
  async publishEvent(command: PublishNotificationEventCommand): Promise<PublishNotificationEventResult> {
    const recipients = await this.resolveRecipients(command)
    if (recipients.length === 0) {
      return { createdCount: 0, recipients: [] }
    }

    const payloadData = command.data === undefined
      ? null
      : JSON.stringify(command.data)

    const result = await prisma.notifications.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: command.eventType,
        title: command.title,
        message: command.message,
        data: payloadData,
      })),
    })

    return {
      createdCount: result.count,
      recipients,
    }
  }

  async listUserNotifications(userId: number, unreadOnly = false): Promise<NotificationItem[]> {
    const notifications = await prisma.notifications.findMany({
      where: {
        userId,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: "desc" },
    })

    return notifications.map((notification) => ({
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: this.parseData(notification.data),
      read: notification.read,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
    }))
  }

  async getUnreadCount(userId: number): Promise<number> {
    return await prisma.notifications.count({
      where: {
        userId,
        read: false,
      },
    })
  }

  async markAsRead(userId: number, notificationId: number): Promise<boolean> {
    const result = await prisma.notifications.updateMany({
      where: {
        id: notificationId,
        userId,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    })

    return result.count > 0
  }

  async markAllAsRead(userId: number): Promise<number> {
    const result = await prisma.notifications.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    })

    return result.count
  }

  async deleteUserNotification(userId: number, notificationId: number): Promise<boolean> {
    const result = await prisma.notifications.deleteMany({
      where: {
        id: notificationId,
        userId,
      },
    })

    return result.count > 0
  }

  private async resolveRecipients(command: PublishNotificationEventCommand): Promise<number[]> {
    if (command.audience.mode === "USER_IDS") {
      return [...new Set(command.audience.userIds.filter((id) => Number.isInteger(id) && id > 0))]
    }

    const users = await prisma.users.findMany({
      where: { status: "active" },
      select: { id: true },
    })
    return users.map((user) => user.id)
  }

  private parseData(data: string | null): unknown {
    if (!data) return null
    try {
      return JSON.parse(data)
    } catch {
      return data
    }
  }
}

export function createNotificationsGateway() {
  return new PrismaNotificationsGateway()
}
