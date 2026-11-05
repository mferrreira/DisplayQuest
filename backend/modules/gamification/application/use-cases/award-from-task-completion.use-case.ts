import { applyPassiveBonus, buildAwardDescription, taskAwardPoints } from "@/backend/domain"
import type { GamificationSourceType } from "@/backend/domain"
import type {
  AwardFromTaskCompletionCommand,
  GamificationAwardResult,
} from "@/backend/modules/gamification/application/contracts"
import type { GamificationAwardHistoryPort } from "@/backend/modules/gamification/application/ports/gamification-award-history.port"
import type { EquippedPassivesPort } from "@/backend/modules/gamification/application/ports/equipped-passives.port"
import type { EvaluateUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case"
import type { GetUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/get-user-progression.use-case"

/**
 * AwardFromTaskCompletionUseCase — OND6-B2 (R2). Congelado do golden OND6-B1
 * (PrismaGamificationGateway.awardFromTaskCompletion :80-123): default 10 em
 * undefined/null, Math.floor (0 => 0 SEM clamp minimo — QUIRK proprio do caminho
 * de task), idempotencia por DESCRICAO `GAMIFICATION:TASK_COMPLETED:<id>`,
 * avaliacao de badges depois do credit.
 *
 * plan-v15 S05 (R10/R11): a passiva equipada multiplica o premio NA ESCRITA, depois da
 * regra pura `taskAwardPoints` — a regra pura esta intocada. Cap +100% (soma de pct
 * limitada a 1). Idempotencia continua por descricao; premio ja creditado nao e
 * recalculado (R11, `alreadyAwarded` devolve 0 antes do bonus).
 */

export interface AwardFromTaskCompletionDependencies {
  awardHistory: GamificationAwardHistoryPort
  progression: GetUserProgressionUseCase
  evaluateUserBadges: EvaluateUserBadgesUseCase
  passives: EquippedPassivesPort
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

    const pointsAwarded = applyPassiveBonus(taskAwardPoints(command.taskPoints), await this.dependencies.passives.listEquippedEffects(command.userId))
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
