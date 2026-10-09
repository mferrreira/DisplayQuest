import { ValidationError, normalizeUserIdAudience, requireActorPermission } from "@/backend/domain"
import type {
  PublishNotificationEventCommand,
} from "@/backend/modules/notifications/application/contracts"
import type { NotificationRepository } from "@/backend/modules/notifications/application/ports/notification.repository"

/**
 * PublishNotificationEventUseCase — holds the publish rules (OND1-B2, R2; SPEC §1.2).
 *
 * Rules owned here (previously inside the infrastructure gateway):
 *   - validation of title/message/audience, now as typed `ValidationError` (RG-11) with the
 *     SAME messages frozen by the golden matrix (OND1-B1);
 *   - recipient normalization (dedupe + positive-integer filter) via the pure domain rule
 *     `normalizeUserIdAudience`;
 *   - audience semantics: ALL_ACTIVE_USERS is resolved through the repository's
 *     `listActiveUserIds` and converted to a normalized USER_IDS audience before persisting;
 *   - empty-recipient policy: short-circuit with { createdCount: 0, recipients: [] } and no
 *     repository call (golden-frozen behavior);
 *   - envelope encoding (B10 · D8, DEC-125): `data` is JSON-encoded exactly as the old gateway
 *     adapter did (undefined -> null, otherwise `JSON.stringify`) — the frozen wire shape of the
 *     String column. The gateway facade port was removed; the use case now speaks to the thin
 *     persistence port directly.
 *
 * Authorisation (D4, B6-2b, DEC-53/DEC-54): `MANAGE_NOTIFICATIONS` was asserted in the route by
 * `ensurePermission` and is asserted here now, FIRST — before the title/message validation. The
 * order is the measured contract, not a detail: a caller without the permission gets 403 even
 * with an empty title, which is what the route did by checking before it parsed the body. (The
 * route keeps its own 400s with its own wording for the HTTP path; see
 * `tests/unit/api/notification-authorization.test.ts`.)
 *
 * The `actor` on the command is required because the two internal publishers that also call this
 * use case — lab issues and submitted reports — have no person to authorise. See
 * `backend/domain/identity/actor-ref.ts` for why that is a typed `systemActor` and not an
 * optional field.
 */
export class PublishNotificationEventUseCase {
  constructor(private readonly repository: NotificationRepository) {}

  async execute(command: PublishNotificationEventCommand) {
    requireActorPermission(
      command.actor,
      "MANAGE_NOTIFICATIONS",
      "Sem permissão para criar notificações",
    )

    if (!command.title?.trim()) {
      throw new ValidationError("Título é obrigatório")
    }
    if (!command.message?.trim()) {
      throw new ValidationError("Mensagem é obrigatória")
    }
    if (command.audience.mode === "USER_IDS" && command.audience.userIds.length === 0) {
      throw new ValidationError("Nenhum destinatário informado")
    }

    let userIds: number[] = command.audience.mode === "USER_IDS" ? command.audience.userIds : []
    if (command.audience.mode === "ALL_ACTIVE_USERS") {
      userIds = await this.repository.listActiveUserIds()
    }

    const recipients = normalizeUserIdAudience(userIds)
    if (recipients.length === 0) {
      return { createdCount: 0, recipients: [] }
    }

    const payloadData = command.data === undefined ? null : JSON.stringify(command.data)

    const createdCount = await this.repository.createMany(
      recipients.map((userId) => ({
        userId,
        type: command.eventType,
        title: command.title,
        message: command.message,
        data: payloadData,
      })),
    )

    return { createdCount, recipients }
  }
}
