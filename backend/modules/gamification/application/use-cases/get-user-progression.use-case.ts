import { computeUserProgression, NotFoundError } from "@/backend/domain"
import type { UserProgression } from "@/backend/domain"
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port"

/**
 * GetUserProgressionUseCase — OND6-B2 (R2). Congelado do golden OND6-B1
 * (PrismaGamificationGateway.getUserProgression :125-153): select { id, points },
 * ausente -> "Usuário não encontrado" (legado: Error; novo: NotFoundError, mesma
 * mensagem — evolucao de tipo, paridade por MENSAGEM conforme DEC-18).
 */

export interface GetUserProgressionDependencies {
  users: GamificationUsersPort
}

export class GetUserProgressionUseCase {
  constructor(private readonly dependencies: GetUserProgressionDependencies) {}

  async execute(userId: number): Promise<UserProgression> {
    const user = await this.dependencies.users.findProgressionById(userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    return computeUserProgression(user.id, user.points)
  }
}
