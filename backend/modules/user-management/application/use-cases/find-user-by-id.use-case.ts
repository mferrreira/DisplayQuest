import { requireActorSelfOrPermission, toPublicUser } from "@/backend/domain"
import type { ActorRef } from "@/backend/domain"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * FindUserByIdUseCase — read use case (OND2-B2). Returns the public shape (no password), same
 * as the model's toJSON today.
 *
 * B6-4 (D4): self || MANAGE_USERS. As duas rotas que leem um usuário congelaram MENSAGENS
 * DIFERENTES para a mesma regra — "Acesso negado" (users/[id]) e "Não autorizado" (profile) —
 * então a mensagem entra como parâmetro (a decisão é uma; a string é contrato de rota). Os
 * chamadores de avatar (users/avatar, users/[id]/avatar) operam sempre em self e passam pelo
 * gate; a trava self-only dessas duas rotas fica onde está (elas não são do D4).
 */
export class FindUserByIdUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(actor: ActorRef, userId: number, deniedMessage?: string) {
    requireActorSelfOrPermission(actor, userId, "MANAGE_USERS", deniedMessage)
    const user = await this.repository.findById(userId)
    return user ? toPublicUser(user) : null
  }
}
