import type { NotificationsGateway } from "@/backend/modules/notifications/application/ports/notifications.gateway"

export class GetUnreadCountUseCase {
  constructor(private readonly gateway: NotificationsGateway) {}

  async execute(userId: number) {
    return await this.gateway.getUnreadCount(userId)
  }
}
