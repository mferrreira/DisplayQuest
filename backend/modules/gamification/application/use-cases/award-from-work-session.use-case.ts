import { POINTS_GAMIFICATION_TRACK, TROPHY_BOOST_VERB_BY_SOURCE, XP_EVENT_WORK_SESSION, applyTrophyCredit, buildAwardDescription, readTrophyEffects, trophyCreditLedger, workSessionAwardPoints, xpAwardDescription } from "@/backend/domain"
import type { GamificationSourceType } from "@/backend/domain"
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"
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
 *   2. ja concedido -> montante 0 + progressao CORRENTE (nao zerada);
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
  /** V8-6 (DEC-218): o verbo `pontos_sessao` dos troféus equipados no instantâneo do credit. */
  userBadges: UserBadgePort
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
        amountAwarded: 0,
        track: POINTS_GAMIFICATION_TRACK,
        xpAwarded: 0,
        newProgression: progression,
        alreadyAwarded: true,
      }
    }

    const amount = workSessionAwardPoints(command.durationSeconds, command.completedTaskIds)
    // V8-6 (DEC-218/219): sem penalidade na fonte de sessão (a régua é de duração e tarefas),
    // então o efeito aqui é só o boost de `pontos_sessao`. Sem troféu equipado, o número é o golden.
    const effects = readTrophyEffects(
      (await this.dependencies.userBadges.findEquippedEffectsByUserId(command.userId)).flatMap((row) => row.effects),
    )
    const trophyVerb = TROPHY_BOOST_VERB_BY_SOURCE[sourceType]
    const credit = applyTrophyCredit({ boostVerb: trophyVerb, amount, effects })
    const trophy = trophyCreditLedger(credit, trophyVerb)
    // V8-3 (DEC-214): +10 flat por SESSÃO concluída. O evento é o fim da sessão
    // (completeWorkSession → onWorkSessionCompleted), não o valor do prêmio da sessão, que é
    // aritmética de duração e de tarefas (QUIRK-6B congelado).
    const xpAwarded = XP_EVENT_WORK_SESSION

    await this.dependencies.awardHistory.awardAndRecord({
      userId: command.userId,
      sourceType,
      sourceId,
      description,
      amount: credit.amount,
      track: POINTS_GAMIFICATION_TRACK,
      xp: { description: xpAwardDescription(sourceType, sourceId), amount: xpAwarded },
      trophy: trophy ?? undefined,
    })

    const newProgression = await this.dependencies.progression.execute(command.userId)

    await this.dependencies.evaluateUserBadges.execute(command.userId)

    return {
      userId: command.userId,
      sourceType,
      sourceId,
      amountAwarded: credit.amount,
      track: POINTS_GAMIFICATION_TRACK,
      xpAwarded,
      newProgression,
      alreadyAwarded: false,
    }
  }
}
