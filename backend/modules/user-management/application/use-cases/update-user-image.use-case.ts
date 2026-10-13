import {
  NotFoundError,
  PROFILE_DENIED_MESSAGE,
  requireActorSelfOrPermission,
  toPublicUser,
  type UserImageSlot,
} from "@/backend/domain"
import type { UpdateUserImageCommand } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * V5-3 (DEC-137) — slot → coluna. Existe para o slot ser de verdade uma decisão e não um parâmetro
 * decorativo: com um valor só hoje, `{ banner: "bannerKey" }`; um slot novo (avatar no bucket) entra
 * por aqui e o use case não muda.
 */
const USER_IMAGE_COLUMNS: Record<UserImageSlot, "bannerKey"> = { banner: "bannerKey" }

/**
 * UpdateUserImageUseCase — V5-3 (DEC-137): capa do perfil no bucket.
 *
 * O gate é o MESMO do perfil (`self OU MANAGE_USERS`, mensagem própria "Não autorizado"), a
 * autoridade medida em `UpdateUserProfileUseCase` (B6-4) — não inventei regra nova. As rotas de
 * avatar continuam com a trava self-only delas; esta também é self na prática porque é o dono do
 * perfil quem sobe a capa.
 *
 * O binário não passa por aqui (DEC-133): quem move byte é a rota pelo seam
 * `lib/storage/blob-store.ts`; o módulo guarda a chave e a autorização. `previousKey` volta no
 * resultado para a rota poder apagar o objeto velho depois de o registro apontar para o novo.
 */
export class UpdateUserImageUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(command: UpdateUserImageCommand) {
    const { actor, userId, slot, blobKey } = command

    requireActorSelfOrPermission(actor, userId, "MANAGE_USERS", PROFILE_DENIED_MESSAGE)

    const user = await this.repository.findById(userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const column = USER_IMAGE_COLUMNS[slot]
    const previousKey = user[column] ?? null
    user[column] = blobKey

    return {
      user: toPublicUser(await this.repository.update(user)),
      previousKey,
    }
  }
}
