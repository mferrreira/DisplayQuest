import { requireActorPermission } from "@/backend/domain/identity"
import type { ActorRef } from "@/backend/domain"

/**
 * AssertCanCreateProjectUseCase — o assert do POST /api/projects (B6-3, D4), no padrao do
 * AssertCanPublishNotificationEventUseCase (B6-2b): o gate legado (`ensurePermission` com a
 * mensagem propria "Sem permissão para criar projeto") rodava ANTES de a rota ler o corpo.
 * Sem o assert, corpo invalido para quem nao tem MANAGE_PROJECTS viraria 500 em vez de 403.
 * A rota autoriza aqui antes do parse; `createProject` recheca no proprio ator.
 */
export class AssertCanCreateProjectUseCase {
  execute(command: { actor: ActorRef }): void {
    requireActorPermission(command.actor, "MANAGE_PROJECTS", "Sem permissão para criar projeto")
  }
}
