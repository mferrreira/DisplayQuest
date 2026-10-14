import { requireActorSelfOrPermission, toPublicUserWithCpf } from "@/backend/domain"
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
 *
 * V5-4a (DEC-138): o CPF sai por aqui. Medido: os quatro chamadores deste use case já passaram
 * por `self OU MANAGE_USERS`, que é exatamente a regra de leitura do CPF — a mesma do
 * `canActorReadUserCpf`. Não há leitura de usuário por esta porta que não tenha o direito, então
 * a projeção com CPF é a única forma de sair. A LISTA de usuários é outro caminho
 * (`ListUsersForActorUseCase`) e é lá que a restrição tem que decidir tier por tier.
 */
export class FindUserByIdUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(actor: ActorRef, userId: number, deniedMessage?: string) {
    requireActorSelfOrPermission(actor, userId, "MANAGE_USERS", deniedMessage)
    const user = await this.repository.findById(userId)
    return user ? toPublicUserWithCpf(user) : null
  }
}
