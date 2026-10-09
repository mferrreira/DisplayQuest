import { requireActorPermission } from "@/backend/domain"
import type { PublishNotificationEventCommand } from "@/backend/modules/notifications/application/contracts"

/**
 * AssertCanPublishNotificationEventUseCase — authorisation only, no publication (D4, B6-2b).
 *
 * This exists because `POST /api/notifications` cannot move its gate into
 * `PublishNotificationEventUseCase` without changing an observable behaviour. The route validates
 * the body with its OWN wording ("Título e mensagem são obrigatórios", "Informe ao menos um
 * destinatário"), which is frozen in `notifications-routes.test.ts` and is deliberately
 * different from the use case's own frozen wording ("Título é obrigatório", "Nenhum destinatário
 * informado"). So the validations cannot move down to join the gate.
 *
 * Left that way, the gate descending alone would run AFTER those route-level 400s, and a caller
 * with no MANAGE_NOTIFICATIONS sending an empty title would get 400 instead of the 403 they get
 * today. `tests/unit/api/notification-authorization.test.ts` pins that order, and it was measured
 * before the move rather than assumed.
 *
 * So the route asks this use case first, before it reads the body, then calls `publishEvent` —
 * which asserts again on its own `actor`. The second assert is not redundant: it is what keeps the
 * use case safe for every caller that is not this route, including the two system publishers.
 */
export class AssertCanPublishNotificationEventUseCase {
  async execute(command: Pick<PublishNotificationEventCommand, "actor">): Promise<void> {
    requireActorPermission(
      command.actor,
      "MANAGE_NOTIFICATIONS",
      "Sem permissão para criar notificações",
    )
  }
}