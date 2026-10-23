import { POINTS_GAMIFICATION_TRACK, TROPHY_BOOST_VERB_BY_SOURCE, XP_EVENT_TASK_COMPLETED, applyTrophyCredit, buildAwardDescription, readTrophyEffects, taskAwardPoints, trophyCreditLedger, xpAwardDescription } from "@/backend/domain"
import type { GamificationSourceType } from "@/backend/domain"
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"
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
 *
 * V8-6 (DEC-218/219): os troféus EQUIPADOS entram na conta no instantâneo do credit. O valor que a
 * régua produziu (`taskPoints`, já atravessada pelo prazo) é o `amount` do pedido, e a `latePenalty`
 * que o publicador trouxe (DEC-219) é a componente que o verbo `penalidade` desconta — sem ela,
 * `-20` não diz quanto de `-20` é punição. Quem aplica é a regra pura (`applyTrophyCredit`); este
 * use case só monta o pedido e leva o resultado para o ledger. Sem troféu equipado o número é
 * exatamente o de antes, e é isso que mantém os golden de premiação intactos.
 *
 * Consequência medida e aceita: `task_user_progress.awardedPoints` guarda o valor da RÉGUA (o prêmio
 * que a tarefa produziu), e o ledger guarda o que a PESSOA recebeu (com o boost). Os dois divergem
 * quando há boost equipado, e cada um responde uma pergunta: a progressão da tarefa fala do trabalho,
 * o livro-caixa da gamificação fala do crédito. A resposta HTTP leva o creditado (DEC-93: o chip
 * mostra o que o servidor creditou), nunca o recalculado pela régua.
 */

export interface AwardFromTaskCompletionDependencies {
  awardHistory: GamificationAwardHistoryPort
  progression: GetUserProgressionUseCase
  evaluateUserBadges: EvaluateUserBadgesUseCase
  /** V8-6: os efeitos dos troféus equipados, lidos no instantâneo do credit. */
  userBadges: UserBadgePort
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
    // V8-6 (DEC-218/219): o boost é lido AGORA — o que já foi creditado não se recalcula.
    const effects = readTrophyEffects(
      (await this.dependencies.userBadges.findEquippedEffectsByUserId(command.userId)).flatMap((row) => row.effects),
    )
    const trophyVerb = TROPHY_BOOST_VERB_BY_SOURCE[sourceType]
    const credit = applyTrophyCredit({
      boostVerb: trophyVerb,
      amount,
      penalty: command.latePenalty ?? null,
      effects,
    })
    const trophy = trophyCreditLedger(credit, trophyVerb)
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
