import type { NotificationRepository } from "@/backend/modules/notifications/application/ports/notification.repository"

/**
 * DeleteUserNotificationUseCase (B10 · D8, DEC-125): porta fina; a contagem de linhas excluidas
 * vira boolean na decisao do use case, como o adapter antigo fazia.
 */
export class DeleteUserNotificationUseCase {
  constructor(private readonly repository: NotificationRepository) {}

  async execute(userId: number, notificationId: number) {
    const affected = await this.repository.remove(userId, notificationId)
    return affected > 0
  }
}
