import type {
  ActivityCompletionAwardPort,
  ActivityAwardOutcome,
} from "@/backend/modules/project-management/application/ports/activity-completion-award.port"

/**
 * GamificationActivityCompletionAward — V5-7b (DEC-21, espelho do `TaskAwardPort` do caminho
 * de tarefa). O módulo de projeto depende só desta interface local; o composition root injeta
 * o módulo de gamification, que satisfaz a porta estruturalmente porque devolve mais campos
 * (`GamificationAwardResult` não atravessa a fronteira — só `pointsAwarded`).
 */
export interface ActivityAwardSource {
  awardFromActivityCompletion(input: {
    userId: number
    activityId: number
    points: number
  }): Promise<{ pointsAwarded: number } | null>
}

class GamificationActivityCompletionAward implements ActivityCompletionAwardPort {
  constructor(private readonly source: ActivityAwardSource) {}

  async awardActivityCompletion(input: {
    userId: number
    activityId: number
    points: number
  }): Promise<ActivityAwardOutcome | null> {
    if (!input.userId || !input.activityId) {
      return null
    }
    const outcome = await this.source.awardFromActivityCompletion(input)
    return typeof outcome?.pointsAwarded === "number" ? { pointsAwarded: outcome.pointsAwarded } : null
  }
}

export function createGamificationActivityCompletionAward(
  source: ActivityAwardSource,
): ActivityCompletionAwardPort {
  return new GamificationActivityCompletionAward(source)
}

/**
 * Default da factory quando gamification não está injetada. NÃO é silencioso de propósito
 * (DEC-54: default no-op mudo é como buraco de wiring se esconde) — credita nada e avisa no
 * log. O composition root injeta o real; este default só existe para o factory montar o
 * módulo sem gamification em testes que não exercitam a aprovação.
 */
export function createNoOpActivityCompletionAward(): ActivityCompletionAwardPort {
  return {
    async awardActivityCompletion(input) {
      console.warn("activityAwards não conectado — prêmio de atividade não creditado", input)
      return null
    },
  }
}
