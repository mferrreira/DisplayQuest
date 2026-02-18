import type { NotificationsGateway } from "@/backend/modules/notifications/application/ports/notifications.gateway"

export class DeleteUserNotificationUseCase {
  constructor(private readonly gateway: NotificationsGateway) {}

  async execute(userId: number, notificationId: number) {
    return await this.gateway.deleteUserNotification(userId, notificationId)
  }
}
