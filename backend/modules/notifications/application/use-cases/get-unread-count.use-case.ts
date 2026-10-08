import type { NotificationRepository } from "@/backend/modules/notifications/application/ports/notification.repository"

/** GetUnreadCountUseCase (B10 · D8, DEC-125): porta fina; a fachada `NotificationsGateway` saiu. */
export class GetUnreadCountUseCase {
  constructor(private readonly repository: NotificationRepository) {}

  async execute(userId: number) {
    return await this.repository.countUnread(userId)
  }
}
