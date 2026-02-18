import type { NotificationsGateway } from "@/backend/modules/notifications/application/ports/notifications.gateway"

export class ListUserNotificationsUseCase {
  constructor(private readonly gateway: NotificationsGateway) {}

  async execute(userId: number, unreadOnly = false) {
    return await this.gateway.listUserNotifications(userId, unreadOnly)
  }
}
