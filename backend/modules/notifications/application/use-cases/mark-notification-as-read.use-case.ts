import type { NotificationRepository } from "@/backend/modules/notifications/application/ports/notification.repository"

/**
 * MarkNotificationAsReadUseCase (B10 · D8, DEC-125): porta fina; a fachada `NotificationsGateway`
 * saiu. O relogio (readAt) entra aqui — os casos de uso sao o lugar onde o `new Date()` vive
 * (o dominio recebe `now` por parametro), e a contagem de linhas afetadas vira boolean na
 * decisao do use case, como o adapter antigo fazia.
 */
export class MarkNotificationAsReadUseCase {
  constructor(private readonly repository: NotificationRepository) {}

  async execute(userId: number, notificationId: number) {
    const affected = await this.repository.markRead(userId, notificationId, new Date())
    return affected > 0
  }
}
