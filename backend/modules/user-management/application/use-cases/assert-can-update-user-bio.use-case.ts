import { NotFoundError, PROFILE_DENIED_MESSAGE, requireActorSelfOrPermission, type ActorRef } from "@/backend/domain"

/**
 * AssertCanUpdateUserBioUseCase — S08 (plan-v21, R13/DEC-263).
 *
 * A porta de escrita da bio: SELF OU `MANAGE_USERS` (DEC-137), com o lookup do usuário ANTES
 * do gate. A rota de imagem chama este assert ANTES de `request.formData()` (DEC-133) — sem
 * isso, um terceiro empurra bytes ao bucket e só depois recebe o 403.
 */
interface UserLookupPort {
  findById(id: number): Promise<{ id: number } | null>
}

export class AssertCanUpdateUserBioUseCase {
  constructor(private readonly users: UserLookupPort) {}

  async execute(command: { actor: ActorRef; userId: number }) {
    const user = await this.users.findById(command.userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }
    requireActorSelfOrPermission(command.actor, command.userId, "MANAGE_USERS", PROFILE_DENIED_MESSAGE)
  }
}
