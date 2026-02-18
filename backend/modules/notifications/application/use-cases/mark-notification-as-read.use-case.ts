import type { NotificationsGateway } from "@/backend/modules/notifications/application/ports/notifications.gateway"

export class MarkNotificationAsReadUseCase {
  constructor(private readonly gateway: NotificationsGateway) {}

  async execute(userId: number, notificationId: number) {
    return await this.gateway.markAsRead(userId, notificationId)
  }
}
