import { COINS_GAMIFICATION_TRACK, XP_EVENT_ACTIVITY_COMPLETED, buildAwardDescription, xpAwardDescription } from "@/backend/domain"
import type { GamificationSourceType } from "@/backend/domain"
import type {
  AwardFromActivityCompletionCommand,
  GamificationAwardResult,
} from "@/backend/modules/gamification/application/contracts"
import type { GamificationAwardHistoryPort } from "@/backend/modules/gamification/application/ports/gamification-award-history.port"
import type { EvaluateUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case"
import type { GetUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/get-user-progression.use-case"

/**
 * AwardFromActivityCompletionUseCase — V5-7b (DEC-63/103/104, DEC-21 pelo lado de dentro).
 *
 * Mesma máquina do caminho de tarefa (awardHistory.hasAward → awardAndRecord em transação →
 * progressão → badges), com três diferenças medidas:
 *
 *   - a chave de idempotência é `GAMIFICATION:ACTIVITY_COMPLETED:<atividade>` — como a
 *     distribuição gera uma linha por membro, cada membro tem a SUA chave para a MESMA
 *     atividade; reexecutar a aprovação credita 0 a todos, não dois;
 *   - o valor entra pronto: é a parcela da distribuição Hamilton (DEC-164), decidida no
 *     domínio de projeto. Gamification não re-aritmética prêmio de projeto (DEC-103: a
 *     escala é própria do projeto).
 *
 * V8-5 (DEC-215): o DESTINO mudou, a aritmética não. O credit cai em `users.coins` com track
 * COINS (moeda vitalícia da loja) em vez de `users.points`, e a chave de idempotência continua a
 * mesma descrição da fonte — reexecutar a aprovação continua creditando 0 a todos. O XP da
 * temporada (+20 por membro, DEC-214) acompanha o credit como antes: a linha de XP nasce junto da
 * linha de moeda, não depois.
 */
export interface AwardFromActivityCompletionDependencies {
  awardHistory: GamificationAwardHistoryPort
  progression: GetUserProgressionUseCase
  evaluateUserBadges: EvaluateUserBadgesUseCase
}

export class AwardFromActivityCompletionUseCase {
  constructor(private readonly dependencies: AwardFromActivityCompletionDependencies) {}

  async execute(command: AwardFromActivityCompletionCommand): Promise<GamificationAwardResult> {
    const sourceType: GamificationSourceType = "ACTIVITY_COMPLETED"
    const sourceId = command.activityId
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
        track: COINS_GAMIFICATION_TRACK,
        xpAwarded: 0,
        newProgression: progression,
        alreadyAwarded: true,
      }
    }

    const amount = command.coins
    // V8-3 (DEC-214): +20 por MEMBRO — o use case já é chamado uma vez por membro da
    // distribuição Hamilton (DEC-164), então este número é por linha de distribuição, não por
    // atividade. O valor da moeda/prêmio continua chegando pronto: gamification não re-aritmética
    // prêmio de projeto (DEC-103).
    const xpAwarded = XP_EVENT_ACTIVITY_COMPLETED

    await this.dependencies.awardHistory.awardAndRecord({
      userId: command.userId,
      sourceType,
      sourceId,
      description,
      amount,
      track: COINS_GAMIFICATION_TRACK,
      xp: { description: xpAwardDescription(sourceType, sourceId), amount: xpAwarded },
    })

    const newProgression = await this.dependencies.progression.execute(command.userId)

    await this.dependencies.evaluateUserBadges.execute(command.userId)

    return {
      userId: command.userId,
      sourceType,
      sourceId,
      amountAwarded: amount,
      track: COINS_GAMIFICATION_TRACK,
      xpAwarded,
      newProgression,
      alreadyAwarded: false,
    }
  }
}
