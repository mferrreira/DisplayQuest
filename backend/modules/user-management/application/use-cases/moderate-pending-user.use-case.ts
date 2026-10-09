import { NotFoundError, requireActorPermission, toPublicUser } from "@/backend/domain"
import type { ActorRef } from "@/backend/domain"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"
import { DeleteUserUseCase } from "./delete-user.use-case"
import { PENDING_MODERATION_DENIED_MESSAGE } from "@/backend/domain"

/**
 * ModeratePendingUserUseCase — approval flow (OND2-B2, R2): approve flips status to active;
 * reject DELETES the user (the current behavior — `deleteUser` semantics, including its
 * NotFound error, preserved by delegating to DeleteUserUseCase).
 *
 * B6-4 (D4): MANAGE_USERS com a mensagem própria "Acesso negado." (ponto final congelado da
 * rota). O gate fica AQUI e o deleteUser interno recebe o MESMO ator — o reject é feito pela
 * pessoa que moderou, não por um ator inventado (DEC-54: quem tem pessoa atrás entrega a
 * pessoa; quem não tem, entrega systemActor com reason).
 */
export class ModeratePendingUserUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly deleteUser: DeleteUserUseCase,
  ) {}

  async execute(actor: ActorRef, userId: number, action: "approve" | "reject") {
    requireActorPermission(actor, "MANAGE_USERS", PENDING_MODERATION_DENIED_MESSAGE)

    if (action === "approve") {
      const user = await this.repository.findById(userId)
      if (!user) throw new NotFoundError("Usuário não encontrado")
      user.status = "active"
      return toPublicUser(await this.repository.update(user))
    }

    return await this.deleteUser.execute(actor, userId)
  }
}
