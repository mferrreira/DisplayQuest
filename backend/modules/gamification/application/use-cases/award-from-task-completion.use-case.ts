import { POINTS_GAMIFICATION_TRACK, XP_EVENT_TASK_COMPLETED, buildAwardDescription, taskAwardPoints, xpAwardDescription } from "@/backend/domain"
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
 *
 * V8-3 (DEC-214): `xpAwarded` deixa de ser o espelho do montante do prêmio (a derivação dormente de
 * `Progression.ts`) e passa a ser o XP creditado em `users.xp`: +10 flat por tarefa aprovada, na
 * mesma transação do prêmio. Nenhum consumidor do valor espelhado existia (medido por grep: o campo
 * não sai de rota nenhuma).
 *
 * V8-5 (DEC-215): o campo do montante passou a `amountAwarded` e o record declara `track`. A
 * tarefa continua creditando POINTS: o que mudou de destino foi só o prêmio de atividade.
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
        amountAwarded: 0,
        track: POINTS_GAMIFICATION_TRACK,
        xpAwarded: 0,
        newProgression: progression,
        alreadyAwarded: true,
      }
    }

    const amount = taskAwardPoints(command.taskPoints)
    // V8-3 (DEC-214): XP é +10 FLAT por tarefa aprovada — não deriva do valor do prêmio, que
    // obedece ao prazo (DEC-97). O caminho só é chamado quando a tarefa chegou a `done`
    // (completeTask credita no `done`; approveTask credita na aprovação; delegated em
    // `in-review` nunca chega aqui) — medido nos três call sites de publishTaskCompletionAward.
    const xpAwarded = XP_EVENT_TASK_COMPLETED

    await this.dependencies.awardHistory.awardAndRecord({
      userId: command.userId,
      sourceType,
      sourceId,
      description,
      amount,
      track: POINTS_GAMIFICATION_TRACK,
      xp: { description: xpAwardDescription(sourceType, sourceId), amount: xpAwarded },
    })

    const newProgression = await this.dependencies.progression.execute(command.userId)

    await this.dependencies.evaluateUserBadges.execute(command.userId)

    return {
      userId: command.userId,
      sourceType,
      sourceId,
      amountAwarded: amount,
      track: POINTS_GAMIFICATION_TRACK,
      xpAwarded,
      newProgression,
      alreadyAwarded: false,
    }
  }
}
