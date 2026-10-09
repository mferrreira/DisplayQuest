import type { NotificationRepository } from "@/backend/modules/notifications/application/ports/notification.repository"

/**
 * MarkAllNotificationsAsReadUseCase (B10 · D8, DEC-125): porta fina; o relogio (readAt) entra
 * no use case, como nos irmaos.
 */
export class MarkAllNotificationsAsReadUseCase {
  constructor(private readonly repository: NotificationRepository) {}

  async execute(userId: number) {
    return await this.repository.markAllRead(userId, new Date())
  }
}
