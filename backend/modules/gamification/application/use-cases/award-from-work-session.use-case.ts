import { buildAwardDescription, workSessionAwardPoints } from "@/backend/domain"
import type { GamificationSourceType } from "@/backend/domain"
import type {
  AwardFromWorkSessionCommand,
  GamificationAwardResult,
} from "@/backend/modules/gamification/application/contracts"
import type { GamificationAwardHistoryPort } from "@/backend/modules/gamification/application/ports/gamification-award-history.port"
import type { EvaluateUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case"
import type { GetUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/get-user-progression.use-case"

/**
 * AwardFromWorkSessionUseCase — OND6-B2 (R2). Orquestracao congelada do golden
 * OND6-B1 (PrismaGamificationGateway.awardFromWorkSession :38-78):
 *   1. idempotencia por DESCRICAO `GAMIFICATION:WORK_SESSION_COMPLETED:<id>`;
 *   2. ja concedido -> points 0 + progressao CORRENTE (nao zerada);
 *   3. award atomico (increment + history) via port;
 *   4. progressao lida DEPOIS do credit;
 *   5. avaliacao de badges depois do credit (resultado ignorado no award).
 * Usuario inexistente: o tx do port falha (P2025 no adapter Prisma) — mesmo ponto
 * de falha do legado (users.update dentro do $transaction).
 */

export interface AwardFromWorkSessionDependencies {
  awardHistory: GamificationAwardHistoryPort
  progression: GetUserProgressionUseCase
  evaluateUserBadges: EvaluateUserBadgesUseCase
}

export class AwardFromWorkSessionUseCase {
  constructor(private readonly dependencies: AwardFromWorkSessionDependencies) {}

  async execute(command: AwardFromWorkSessionCommand): Promise<GamificationAwardResult> {
    const sourceType: GamificationSourceType = "WORK_SESSION_COMPLETED"
    const sourceId = command.workSessionId
    const description = buildAwardDescription(sourceType, sourceId)

    const alreadyAwarded = await this.dependencies.awardHistory.hasAward({
      userId: command.userId,
      description,
    })
    if (alreadyAwarded) {
      const progression = await this.dependencies.progression.execute(command.userId)
      return {
        userId: command.userId,
        sourceType,
        sourceId,
        pointsAwarded: 0,
        xpAwarded: 0,
        newProgression: progression,
        alreadyAwarded: true,
      }
    }

    const pointsAwarded = workSessionAwardPoints(command.durationSeconds, command.completedTaskIds)
    const xpAwarded = pointsAwarded

    await this.dependencies.awardHistory.awardAndRecord({
      userId: command.userId,
      sourceType,
      sourceId,
      description,
      pointsAwarded,
      xpAwarded,
    })

    const newProgression = await this.dependencies.progression.execute(command.userId)

    await this.dependencies.evaluateUserBadges.execute(command.userId)

    return {
      userId: command.userId,
      sourceType,
      sourceId,
      pointsAwarded,
      xpAwarded,
      newProgression,
      alreadyAwarded: false,
    }
  }
}
