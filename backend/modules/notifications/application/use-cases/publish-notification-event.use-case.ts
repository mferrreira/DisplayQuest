import { ValidationError, normalizeUserIdAudience } from "@/backend/domain"
import type {
  NotificationAudience,
  PublishNotificationEventCommand,
} from "@/backend/modules/notifications/application/contracts"
import type { NotificationsGateway } from "@/backend/modules/notifications/application/ports/notifications.gateway"
import type { ActiveUserDirectory } from "@/backend/modules/notifications/application/ports/notification.repository"

/**
 * PublishNotificationEventUseCase — holds the publish rules (OND1-B2, R2; SPEC §1.2).
 *
 * Rules owned here (previously inside the infrastructure gateway):
 *   - validation of title/message/audience, now as typed `ValidationError` (RG-11) with the
 *     SAME messages frozen by the golden matrix (OND1-B1);
 *   - recipient normalization (dedupe + positive-integer filter) via the pure domain rule
 *     `normalizeUserIdAudience`;
 *   - audience semantics: ALL_ACTIVE_USERS is resolved through the `ActiveUserDirectory` port
 *     and converted to a normalized USER_IDS audience before reaching the gateway;
 *   - empty-recipient policy: short-circuit with { createdCount: 0, recipients: [] } and no
 *     gateway call (golden-frozen behavior).
 */
export class PublishNotificationEventUseCase {
  constructor(
    private readonly gateway: NotificationsGateway,
    private readonly activeUsers: ActiveUserDirectory,
  ) {}

  async execute(command: PublishNotificationEventCommand) {
    if (!command.title?.trim()) {
      throw new ValidationError("Título é obrigatório")
    }
    if (!command.message?.trim()) {
      throw new ValidationError("Mensagem é obrigatória")
    }
    if (command.audience.mode === "USER_IDS" && command.audience.userIds.length === 0) {
      throw new ValidationError("Nenhum destinatário informado")
    }

    let audience: NotificationAudience = command.audience
    if (audience.mode === "ALL_ACTIVE_USERS") {
      audience = { mode: "USER_IDS", userIds: await this.activeUsers.listActiveUserIds() }
    }

    const recipients = normalizeUserIdAudience(audience.userIds)
    if (recipients.length === 0) {
      return { createdCount: 0, recipients: [] }
    }

    return await this.gateway.publishEvent({ ...command, audience: { mode: "USER_IDS", userIds: recipients } })
  }
}
