import type {
  ActivityCompletionAwardPort,
  ActivityAwardOutcome,
} from "@/backend/modules/project-management/application/ports/activity-completion-award.port"

/**
 * GamificationActivityCompletionAward — V5-7b (DEC-21, espelho do `TaskAwardPort` do caminho
 * de tarefa). O módulo de projeto depende só desta interface local; o composition root injeta
 * o módulo de gamification, que satisfaz a porta estruturalmente porque devolve mais campos
 * (`GamificationAwardResult` não atravessa a fronteira — só o montante creditado).
 *
 * V8-5 (DEC-215): o destino do prêmio de atividade é moeda. O adaptador lê o `amountAwarded` do
 * gamification (o campo generico, que o gamification declara com track COINS) e entrega o valor
 * com o vocabulário deste módulo: `coinsAwarded`. O número é a parcela Hamilton calculada pelo
 * domínio de projeto — o adaptador não converte nada.
 */
export interface ActivityAwardSource {
  awardFromActivityCompletion(input: {
    userId: number
    activityId: number
    coins: number
  }): Promise<{ amountAwarded: number } | null>
}

class GamificationActivityCompletionAward implements ActivityCompletionAwardPort {
  constructor(private readonly source: ActivityAwardSource) {}

  async awardActivityCompletion(input: {
    userId: number
    activityId: number
    coins: number
  }): Promise<ActivityAwardOutcome | null> {
    if (!input.userId || !input.activityId) {
      return null
    }
    const outcome = await this.source.awardFromActivityCompletion(input)
    return typeof outcome?.amountAwarded === "number" ? { coinsAwarded: outcome.amountAwarded } : null
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
