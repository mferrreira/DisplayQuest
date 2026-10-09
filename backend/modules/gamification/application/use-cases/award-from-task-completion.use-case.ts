import { buildAwardDescription, taskAwardPoints } from "@/backend/domain"
import type { GamificationSourceType } from "@/backend/domain"
import type {
  AwardFromTaskCompletionCommand,
  GamificationAwardResult,
} from "@/backend/modules/gamification/application/contracts"
import type { GamificationAwardHistoryPort } from "@/backend/modules/gamification/application/ports/gamification-award-history.port"
import type { EvaluateUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case"
import type { GetUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/get-user-progression.use-case"

/**
 * AwardFromTaskCompletionUseCase — OND6-B2 (R2). Congelado do golden OND6-B1
 * (PrismaGamificationGateway.awardFromTaskCompletion :80-123): default 10 em
 * undefined/null, Math.floor (0 => 0 SEM clamp minimo — QUIRK proprio do caminho
 * de task), idempotencia por DESCRICAO `GAMIFICATION:TASK_COMPLETED:<id>`,
 * avaliacao de badges depois do credit.
 */

export interface AwardFromTaskCompletionDependencies {
  awardHistory: GamificationAwardHistoryPort
  progression: GetUserProgressionUseCase
  evaluateUserBadges: EvaluateUserBadgesUseCase
}

export class AwardFromTaskCompletionUseCase {
  constructor(private readonly dependencies: AwardFromTaskCompletionDependencies) {}

  async execute(command: AwardFromTaskCompletionCommand): Promise<GamificationAwardResult> {
    const sourceType: GamificationSourceType = "TASK_COMPLETED"
    const sourceId = command.taskId
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

    const pointsAwarded = taskAwardPoints(command.taskPoints)
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
