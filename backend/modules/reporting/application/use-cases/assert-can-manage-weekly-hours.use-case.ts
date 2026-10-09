import { requireActorPermission } from "@/backend/domain/identity"
import type { ActorRef } from "@/backend/domain"
import { WEEKLY_HOURS_DENIED_MESSAGE } from "@/backend/modules/reporting/application/use-cases/list-weekly-hours-history.use-case"

/**
 * AssertCanManageWeeklyHoursUseCase — o assert do POST /api/weekly-hours-history (B6-3, D4),
 * no padrao dos outros asserts (B6-2b/2d): o gate legado `ensurePermission` rodava ANTES de
 * a rota ler o corpo. Sem o assert, corpo invalido para quem nao tem MANAGE_USERS viraria 500
 * em vez de 403. A rota autoriza aqui antes do parse; os use cases de reset/criacao rechecam.
 */
export class AssertCanManageWeeklyHoursUseCase {
  execute(command: { actor: ActorRef }): void {
    requireActorPermission(command.actor, "MANAGE_USERS", WEEKLY_HOURS_DENIED_MESSAGE)
  }
}
