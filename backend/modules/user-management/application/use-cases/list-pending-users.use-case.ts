import { PENDING_MODERATION_DENIED_MESSAGE, requireActorPermission, toPublicUser } from "@/backend/domain"
import type { ActorRef } from "@/backend/domain"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * ListPendingUsersUseCase — moderation queue read (OND2-B2).
 *
 * B6-4 (D4): MANAGE_USERS com a mensagem própria "Acesso negado." (ponto final congelado, no
 * domínio — `user-denied-messages.ts`). GET /api/users/approve gateava antes de qualquer coisa
 * (sem parse, sem validacao), entao o gate descer para o use case preserva a ordem sem
 * precisar de assert.
 */
export class ListPendingUsersUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(actor: ActorRef) {
    requireActorPermission(actor, "MANAGE_USERS", PENDING_MODERATION_DENIED_MESSAGE)
    const users = await this.repository.findPending()
    return users.map(toPublicUser)
  }
}
