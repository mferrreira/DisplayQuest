import type { NotificationsGateway } from "@/backend/modules/notifications/application/ports/notifications.gateway"

export class MarkAllNotificationsAsReadUseCase {
  constructor(private readonly gateway: NotificationsGateway) {}

  async execute(userId: number) {
    return await this.gateway.markAllAsRead(userId)
  }
}
