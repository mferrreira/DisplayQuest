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
 * DEC-137/242 — slot → coluna. Existe para o slot ser de verdade uma decisão e não um parâmetro
 * decorativo: `{ banner: "bannerKey", avatar: "avatarKey" }`. Um slot novo entra por aqui e o use
 * case não muda.
 */
const USER_IMAGE_COLUMNS: Record<UserImageSlot, "bannerKey" | "avatarKey"> = {
  banner: "bannerKey",
  avatar: "avatarKey",
}

/** DEC-239/242 — o recorte zerado por slot: o recorte é do original, e o original mudou. */
const SLOT_CROP_FIELDS: Record<
  UserImageSlot,
  Array<"bannerCropX" | "bannerCropY" | "bannerCropZoom" | "logoCropX" | "logoCropY" | "logoCropZoom">
> = {
  banner: ["bannerCropX", "bannerCropY", "bannerCropZoom"],
  avatar: ["logoCropX", "logoCropY", "logoCropZoom"],
}

/**
 * UpdateUserImageUseCase — V5-3 (DEC-137) + DEC-242: capa e avatar do perfil no bucket.
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
    // plan-v12 (DEC-239): subir nova capa zera o recorte — o recorte é do original, e o
    // original acabou de mudar. `blobKey: null` (tirar a capa) também zera. DEC-242: a mesma
    // regra vale para o avatar, sobre as colunas quadradas.
    for (const field of SLOT_CROP_FIELDS[slot]) {
      user[field] = null
    }

    return {
      user: toPublicUser(await this.repository.update(user)),
      previousKey,
    }
  }
}
