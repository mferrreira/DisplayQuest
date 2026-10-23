/**
 * V5-7b (DEC-63/104, padrão DEC-21) — porta LOCAL do prêmio de atividade aprovada.
 *
 * O módulo de projeto calcula o prêmio e a distribuição (domínio `activity-rules.ts`) e
 * entrega por esta porta; quem credita é o módulo de gamification, injetado no composition
 * root (RG-04: a infra de um módulo não importa factory do outro — espelho exato da
 * `TaskAwardPort` do caminho de tarefa).
 *
 * Idempotência por membro: a chave é a descrição `GAMIFICATION:ACTIVITY_COMPLETED:<atividade>`
 * no awardHistory (mesma máquina do caminho de tarefa). Reexecução credita 0, não dois.
 *
 * V8-5 (DEC-215): o que atravessa a porta é MOEDA — `coins` é a parcela Hamilton calculada pelo
 * domínio de projeto (`activity-rules.ts`), e o valor entra intacto. A porta não sabe em que
 * coluna o credit cai: quem decide a trilha é o gamification.
 */
export interface ActivityAwardOutcome {
  /** Valor creditado em moeda por esta chamada. 0 quando o award já estava registrado. */
  coinsAwarded: number
}

export interface ActivityCompletionAwardPort {
  awardActivityCompletion(input: {
    userId: number
    activityId: number
    coins: number
  }): Promise<ActivityAwardOutcome | null>
}
