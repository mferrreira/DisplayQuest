import type {
  TaskCompletedEvent,
  TaskProgressEvents,
} from "@/backend/modules/task-management/application/ports/task-progress.events";

/**
 * TaskAwardPort — OND4-B3 (DEC-21 pattern, same as work-execution): the publisher depends
 * on this LOCAL port, not on the gamification module factory. The composition root wires
 * the gamification module in (cross-module only via composition root — SPEC §5), which
 * removes the last cross-module import from this module's infrastructure.
 *
 * plan-v3 OND4-A: o retorno passou de `unknown` para a forma que este módulo de fato precisa
 * ler — `amountAwarded` (o montante creditado na trilha que o gamification declara). Continua
 * sendo uma porta local (o tipo do gamification, `GamificationAwardResult`, não atravessa a
 * fronteira): o módulo de gamification satisfaz a porta estruturalmente porque devolve mais
 * campos, e o adaptador usa só este. A tarefa credita POINTS (placar do mês), então o nome local
 * do valor continua `amountAwarded` — a porta descreve o que o gamification devolve.
 */
export interface TaskAwardOutcome {
  /**
   * Valor creditado por esta conclusão, na trilha que o gamification declara (tarefa = pontos do
   * mês, V8-5). O nome é o campo do gamification: a porta local descreve o que o outro lado devolve,
   * e trocá-lo por um nome próprio seria a fronteira mentir sobre o destino.
   * 0 quando o award já estava registrado (idempotência).
   */
  amountAwarded: number;
}

export interface TaskAwardPort {
  awardFromTaskCompletion(input: { userId: number; taskId: number; taskPoints: number }): Promise<TaskAwardOutcome | null>
}

// V8-1 (DEC-215): a `TaskProjectPointsPort` (V5-7b, DEC-63/74) saiu daqui. A conclusão de
// tarefa não escreve saldo de projeto — `projects.points` não existe mais, e o prêmio de
// atividade aprovada passou a ter destino de pessoa (moeda, V8-5).

class GamificationTaskProgressEvents implements TaskProgressEvents {
  constructor(private readonly awards: TaskAwardPort) {}

  async onTaskCompleted(event: TaskCompletedEvent): Promise<number | null> {
    if (!event.userId || !event.taskId) {
      return null
    }

    const outcome = await this.awards.awardFromTaskCompletion({
      userId: event.userId,
      taskId: event.taskId,
      taskPoints: event.taskPoints,
    })
    // Adaptador sem publisher real (ou de teste) pode devolver nada: `null` é "ninguém creditado".
    const credited = typeof outcome?.amountAwarded === "number" ? outcome.amountAwarded : null

    return credited
  }
}

export function createTaskProgressEvents(dependencies: {
  awards: TaskAwardPort
}): TaskProgressEvents {
  return new GamificationTaskProgressEvents(dependencies.awards)
}
