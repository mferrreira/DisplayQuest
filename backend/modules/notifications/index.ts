import type { PublishNotificationEventCommand } from "@/backend/modules/notifications/application/contracts"
import { DeleteUserNotificationUseCase } from "@/backend/modules/notifications/application/use-cases/delete-user-notification.use-case"
import { GetUnreadCountUseCase } from "@/backend/modules/notifications/application/use-cases/get-unread-count.use-case"
import { ListUserNotificationsUseCase } from "@/backend/modules/notifications/application/use-cases/list-user-notifications.use-case"
import { MarkAllNotificationsAsReadUseCase } from "@/backend/modules/notifications/application/use-cases/mark-all-notifications-as-read.use-case"
import { MarkNotificationAsReadUseCase } from "@/backend/modules/notifications/application/use-cases/mark-notification-as-read.use-case"
import { PublishNotificationEventUseCase } from "@/backend/modules/notifications/application/use-cases/publish-notification-event.use-case"
import {
  createNotificationsGateway,
  PrismaNotificationsGateway,
} from "@/backend/modules/notifications/infrastructure/prisma-notifications.gateway"

export class NotificationsModule {
  constructor(
    private readonly publishNotificationEventUseCase: PublishNotificationEventUseCase,
    private readonly listUserNotificationsUseCase: ListUserNotificationsUseCase,
    private readonly getUnreadCountUseCase: GetUnreadCountUseCase,
    private readonly markNotificationAsReadUseCase: MarkNotificationAsReadUseCase,
    private readonly markAllNotificationsAsReadUseCase: MarkAllNotificationsAsReadUseCase,
    private readonly deleteUserNotificationUseCase: DeleteUserNotificationUseCase,
    private readonly _gateway: PrismaNotificationsGateway,
  ) {}

  async publishEvent(command: PublishNotificationEventCommand) {
    return await this.publishNotificationEventUseCase.execute(command)
  }

  async listUserNotifications(userId: number, unreadOnly = false) {
    return await this.listUserNotificationsUseCase.execute(userId, unreadOnly)
  }

  async getUnreadCount(userId: number) {
    return await this.getUnreadCountUseCase.execute(userId)
  }

  async markAsRead(userId: number, notificationId: number) {
    return await this.markNotificationAsReadUseCase.execute(userId, notificationId)
  }

  async markAllAsRead(userId: number) {
    return await this.markAllNotificationsAsReadUseCase.execute(userId)
  }

  async deleteUserNotification(userId: number, notificationId: number) {
    return await this.deleteUserNotificationUseCase.execute(userId, notificationId)
  }
}

export interface NotificationsModuleFactoryOptions {
  gateway?: PrismaNotificationsGateway
}

export function createNotificationsModule(options: NotificationsModuleFactoryOptions = {}) {
  const gateway = options.gateway ?? createNotificationsGateway()
  return new NotificationsModule(
    new PublishNotificationEventUseCase(gateway),
    new ListUserNotificationsUseCase(gateway),
    new GetUnreadCountUseCase(gateway),
    new MarkNotificationAsReadUseCase(gateway),
    new MarkAllNotificationsAsReadUseCase(gateway),
    new DeleteUserNotificationUseCase(gateway),
    gateway,
  )
}
