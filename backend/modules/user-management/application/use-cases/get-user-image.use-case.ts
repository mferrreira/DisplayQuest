import { NotFoundError, type UserImageSlot } from "@/backend/domain"
import type { GetUserImageCommand } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * GetUserImageUseCase — V5-3 (DEC-137). Existe para a rota que serve o binário: a leitura da capa de
 * um perfil é a leitura do perfil, e o perfil é do autenticado (mesma política da DEC-127 aplicada
 * ao projeto no V5-2a). Não há gate de leitura aqui de propósito: um gate que não pode responder
 * "não" só faz o teste de rota congelar o substituto (a lição medida no V5-2a).
 *
 * Slot sem imagem responde 404 ("Imagem não encontrada"), não um objeto vazio.
 */
export class GetUserImageUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(command: GetUserImageCommand) {
    const user = await this.repository.findById(command.userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const blobKey = user.bannerKey ?? null
    if (!blobKey) {
      throw new NotFoundError("Imagem não encontrada")
    }

    return { slot: command.slot, blobKey }
  }
}
