import { PROFILE_DENIED_MESSAGE, requireActorSelfOrPermission, type ActorRef } from "@/backend/domain"

export interface AssertCanUpdateUserImageCommand {
  actor: ActorRef
  userId: number
}

/**
 * AssertCanUpdateUserImageUseCase — V5-3 (DEC-137). Existe por causa do custo do corpo: upload é
 * multipart, e sem uma checagem ANTES de o corpo ser lido quem não pode escrever empurraria bytes ao
 * bucket e só depois receberia o 403 (o gate medido no V5-2c, DEC-133). A rota autoriza, o
 * `updateUserImage` recheca no próprio ator para proteger os demais chamadores (mesma forma do
 * `assertCanManageProject` + `updateProjectImage`).
 */
export class AssertCanUpdateUserImageUseCase {
  execute(command: AssertCanUpdateUserImageCommand): void {
    requireActorSelfOrPermission(command.actor, command.userId, "MANAGE_USERS", PROFILE_DENIED_MESSAGE)
  }
}
