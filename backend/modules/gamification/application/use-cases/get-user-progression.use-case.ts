import { NotFoundError, computeSeasonProgression } from "@/backend/domain"
import type { UserProgression } from "@/backend/domain"
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port"

/**
 * GetUserProgressionUseCase — OND6-B2 (R2). Congelado do golden OND6-B1
 * (PrismaGamificationGateway.getUserProgression :125-153): select { id, points },
 * ausente -> "Usuário não encontrado" (legado: Error; novo: NotFoundError, mesma
 * mensagem — evolucao de tipo, paridade por MENSAGEM conforme DEC-18).
 *
 * plan-v8 V8-6 (DEC-217): o select passou a `points, xp, coins` e a derivação antiga
 * (`xp = max(0, points)`, `level = floor(xp/100)`, elo por faixa de points) saiu junto — o
 * `computeUserProgression` morreu com ela (MODELO §8, dívida XP-DUPLICADO medida na V8-3). O que o
 * lookup devolve hoje são as TRILHAS com o elo da escada lida do XP da temporada.
 *
 * O lookup continua sem ator: `AwardFromTaskCompletionUseCase` e `AwardFromWorkSessionUseCase` o usam
 * dentro do fluxo de premiação (onde não há pessoa escolhendo de quem ler), e o gate de leitura mora
 * em `ReadUserProgressionUseCase`. Além disso o elo do slot (DEC-217) é lido daqui: quem decide o
 * teto de troféu equipável é a mesma regra que o read model reporta — não uma segunda conta.
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

    return computeSeasonProgression({
      userId: user.id,
      points: user.points,
      xp: user.xp,
      coins: user.coins,
    })
  }
}
