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
 * ler — `pointsAwarded`. Continua sendo uma porta local (o tipo do gamification, `GamificationAwardResult`,
 * não atravessa a fronteira): o módulo de gamification satisfaz a porta estruturalmente porque
 * devolve mais campos, e o adaptador usa só este.
 */
export interface TaskAwardOutcome {
  /** Valor creditado por esta conclusão. 0 quando o award já estava registrado (idempotência). */
  pointsAwarded: number;
}

export interface TaskAwardPort {
  awardFromTaskCompletion(input: { userId: number; taskId: number; taskPoints: number }): Promise<TaskAwardOutcome | null>
}

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
    return typeof outcome?.pointsAwarded === "number" ? outcome.pointsAwarded : null
  }
}

export function createTaskProgressEvents(dependencies: { awards: TaskAwardPort }): TaskProgressEvents {
  return new GamificationTaskProgressEvents(dependencies.awards)
}
