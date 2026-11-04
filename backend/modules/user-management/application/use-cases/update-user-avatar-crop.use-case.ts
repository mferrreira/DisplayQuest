import {
  NotFoundError,
  PROFILE_DENIED_MESSAGE,
  requireActorSelfOrPermission,
  toPublicUser,
} from "@/backend/domain"
import type { UpdateUserAvatarCropCommand } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * UpdateUserAvatarCropUseCase — DEC-242: grava os parâmetros do recorte quadrado do avatar
 * (`logoCropX`/`logoCropY`/`logoCropZoom`).
 *
 * O gate é o MESMO do perfil, da capa e do avatar (`self OU MANAGE_USERS`,
 * `PROFILE_DENIED_MESSAGE`), a autoridade medida no V5-3/V5-4a — nenhuma regra nova. O binário
 * não passa por aqui (DEC-133): o recorte é parâmetro, o original continua no bucket na mesma
 * chave. A rota clampa por `clampCropCenterToBand` com a razão quadrada antes de chamar; este
 * use case escreve o que recebeu.
 */
export class UpdateUserAvatarCropUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(command: UpdateUserAvatarCropCommand) {
    const { actor, userId, params } = command

    requireActorSelfOrPermission(actor, userId, "MANAGE_USERS", PROFILE_DENIED_MESSAGE)

    const user = await this.repository.findById(userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    user.logoCropX = params.x
    user.logoCropY = params.y
    user.logoCropZoom = params.zoom

    return toPublicUser(await this.repository.update(user))
  }
}
