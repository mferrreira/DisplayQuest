import type { PublishNotificationEventCommand } from "@/backend/modules/notifications/application/contracts"
import type { NotificationsGateway } from "@/backend/modules/notifications/application/ports/notifications.gateway"
import type { NotificationRepository } from "@/backend/modules/notifications/application/ports/notification.repository"
import { DeleteUserNotificationUseCase } from "@/backend/modules/notifications/application/use-cases/delete-user-notification.use-case"
import { GetUnreadCountUseCase } from "@/backend/modules/notifications/application/use-cases/get-unread-count.use-case"
import { ListUserNotificationsUseCase } from "@/backend/modules/notifications/application/use-cases/list-user-notifications.use-case"
import { MarkAllNotificationsAsReadUseCase } from "@/backend/modules/notifications/application/use-cases/mark-all-notifications-as-read.use-case"
import { MarkNotificationAsReadUseCase } from "@/backend/modules/notifications/application/use-cases/mark-notification-as-read.use-case"
import { AssertCanPublishNotificationEventUseCase } from "@/backend/modules/notifications/application/use-cases/assert-can-publish-notification-event.use-case"
import { PublishNotificationEventUseCase } from "@/backend/modules/notifications/application/use-cases/publish-notification-event.use-case"
import { createNotificationsGatewayAdapter } from "@/backend/modules/notifications/infrastructure/notifications.gateway"
import { createPrismaNotificationRepository } from "@/backend/modules/notifications/infrastructure/repositories/prisma-notification.repository"

export class NotificationsModule {
  constructor(
    private readonly assertCanPublishNotificationEventUseCase: AssertCanPublishNotificationEventUseCase,
    private readonly publishNotificationEventUseCase: PublishNotificationEventUseCase,
    private readonly listUserNotificationsUseCase: ListUserNotificationsUseCase,
    private readonly getUnreadCountUseCase: GetUnreadCountUseCase,
    private readonly markNotificationAsReadUseCase: MarkNotificationAsReadUseCase,
    private readonly markAllNotificationsAsReadUseCase: MarkAllNotificationsAsReadUseCase,
    private readonly deleteUserNotificationUseCase: DeleteUserNotificationUseCase,
  ) {}

  /**
   * D4/B6-2b: the route calls this BEFORE parsing the body, so a caller without
   * MANAGE_NOTIFICATIONS gets 403 rather than one of the route-level 400s. See the use case for
   * why the gate could not simply move into `publishEvent`. Internal system publishers must NOT
   * call this — they have no actor and go straight to `publishEvent` with a `systemActor`.
   */
  async assertCanPublishEvent(command: Pick<PublishNotificationEventCommand, "actor">) {
    return await this.assertCanPublishNotificationEventUseCase.execute(command)
  }

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
  /** New primary seam (OND1-B2): inject a fake `NotificationRepository` in tests. */
  repository?: NotificationRepository
}

export function createNotificationsModule(options: NotificationsModuleFactoryOptions = {}) {
  const repository = options.repository ?? createPrismaNotificationRepository()
  const gateway = createNotificationsGatewayAdapter({ repository })

  return new NotificationsModule(
    new AssertCanPublishNotificationEventUseCase(),
    new PublishNotificationEventUseCase(gateway, repository),
    new ListUserNotificationsUseCase(gateway),
    new GetUnreadCountUseCase(gateway),
    new MarkNotificationAsReadUseCase(gateway),
    new MarkAllNotificationsAsReadUseCase(gateway),
    new DeleteUserNotificationUseCase(gateway),
  )
}
