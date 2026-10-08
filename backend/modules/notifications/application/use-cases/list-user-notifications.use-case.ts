import type { NotificationRepository } from "@/backend/modules/notifications/application/ports/notification.repository"

/**
 * ListUserNotificationsUseCase (B10 · D8, DEC-125): fala com a porta fina de persistencia —
 * a fachada `NotificationsGateway` saiu. A posse do escopo (userId sempre passado) e do use case.
 */
export class ListUserNotificationsUseCase {
  constructor(private readonly repository: NotificationRepository) {}

  async execute(userId: number, unreadOnly = false) {
    return await this.repository.listByUser(userId, { unreadOnly })
  }
}
