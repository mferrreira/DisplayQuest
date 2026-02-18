import type { PublishNotificationEventCommand } from "@/backend/modules/notifications/application/contracts"
import type { NotificationsGateway } from "@/backend/modules/notifications/application/ports/notifications.gateway"

export class PublishNotificationEventUseCase {
  constructor(private readonly gateway: NotificationsGateway) {}

  async execute(command: PublishNotificationEventCommand) {
    if (!command.title?.trim()) {
      throw new Error("Título é obrigatório")
    }
    if (!command.message?.trim()) {
      throw new Error("Mensagem é obrigatória")
    }
    if (command.audience.mode === "USER_IDS" && command.audience.userIds.length === 0) {
      throw new Error("Nenhum destinatário informado")
    }

    return await this.gateway.publishEvent(command)
  }
}
