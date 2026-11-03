import {
  NotFoundError,
  PROFILE_DENIED_MESSAGE,
  requireActorSelfOrPermission,
  toPublicUser,
} from "@/backend/domain"
import type { UpdateUserBannerCropCommand } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * UpdateUserBannerCropUseCase — plan-v12 (DEC-239): grava os parâmetros do recorte da capa
 * (`bannerCropX`/`bannerCropY`/`bannerCropZoom`).
 *
 * O gate é o MESMO do perfil e da capa (`self OU MANAGE_USERS`, `PROFILE_DENIED_MESSAGE`), a
 * autoridade medida no V5-3/V5-4a — nenhuma regra nova. O binário não passa por aqui (DEC-133):
 * o recorte é parâmetro, o original continua no bucket na mesma chave. A rota clampa por
 * `clampBannerCrop` antes de chamar; este use case escreve o que recebeu.
 */
export class UpdateUserBannerCropUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(command: UpdateUserBannerCropCommand) {
    const { actor, userId, params } = command

    requireActorSelfOrPermission(actor, userId, "MANAGE_USERS", PROFILE_DENIED_MESSAGE)

    const user = await this.repository.findById(userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    user.bannerCropX = params.x
    user.bannerCropY = params.y
    user.bannerCropZoom = params.zoom

    return toPublicUser(await this.repository.update(user))
  }
}
