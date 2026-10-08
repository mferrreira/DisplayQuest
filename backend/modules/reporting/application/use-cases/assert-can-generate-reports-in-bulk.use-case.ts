import { requireActorPermission } from "@/backend/domain/identity"
import type { ActorRef } from "@/backend/domain"

/**
 * AssertCanGenerateReportsInBulkUseCase — o assert do POST /api/weekly-reports/bulk (B6-3,
 * D4), no mesmo padrão do AssertCanPublishNotificationEventUseCase (B6-2b) e do
 * AssertCanManagePurchasesUseCase (B6-2d): o gate legado rodava ANTES de a rota ler o corpo.
 * Sem o assert, a rota precisaria parsear antes de chamar o use case e um corpo inválido
 * para quem não tem MANAGE_USERS viraria 500 em vez de 403. A rota autoriza aqui antes do
 * parse; `bulkGenerateWeeklyReports` recheca no próprio ator.
 */
export class AssertCanGenerateReportsInBulkUseCase {
  execute(command: { actor: ActorRef }): void {
    requireActorPermission(command.actor, "MANAGE_USERS")
  }
}
