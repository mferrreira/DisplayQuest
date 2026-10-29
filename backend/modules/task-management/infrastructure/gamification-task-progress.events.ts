import type {
  TaskCompletedEvent,
  TaskProgressEvents,
  TaskUncompletedEvent,
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

/**
 * TaskReversalPort — R13 (S13, padrão DEC-21): a reversão do prêmio de uma tarefa que saiu de
 * `done`. O módulo de tarefa não conhece a chave de premiação nem `users.points`; quem faz o
 * trabalho é o gamification, injetado no composition root. Devolve o valor efetivamente
 * revertido (`reversedPoints`) para o adaptador baixar `projects.points` pelo mesmo total.
 */
export interface TaskReversalOutcome {
  reversedPoints: number;
}

export interface TaskReversalPort {
  reverseTaskAward(input: { userId: number; taskId: number }): Promise<TaskReversalOutcome | null>
}

/**
 * TaskProjectPointsPort — V5-7b (DEC-63/74, padrão DEC-21): a escrita em `projects.points`
 * é do módulo de projeto (o piso 0 é a função pura `projectPointsBalance`, aplicada na
 * escrita congelada do adaptador de projects). O composition root injeta o adaptador real;
 * o módulo de tarefa só conhece esta interface local — espelho da `TaskAwardPort` acima.
 */
export interface TaskProjectPointsPort {
  incrementProjectPoints(projectId: number, delta: number): Promise<unknown>
}

class GamificationTaskProgressEvents implements TaskProgressEvents {
  constructor(
    private readonly awards: TaskAwardPort,
    private readonly projectPoints?: TaskProjectPointsPort,
    private readonly reversals?: TaskReversalPort,
  ) {}

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
    const credited = typeof outcome?.pointsAwarded === "number" ? outcome.pointsAwarded : null

    // DEC-63: tarefa de projeto concluída também incrementa `projects.points` — pelo valor
    // EFETIVAMENTE creditado (idempotência devolve 0, e 0 não escreve: sem re-execução o
    // saldo não muda duas vezes). Negativo passa — o piso 0 é da escrita do adaptador
    // (DEC-74), não daqui. Falha desta escrita não quebra a conclusão (mesmo quirk do award).
    if (credited !== null && credited !== 0 && event.projectId && this.projectPoints) {
      try {
        await this.projectPoints.incrementProjectPoints(event.projectId, credited)
      } catch (error) {
        console.error("Erro ao incrementar pontos do projeto na conclusão de task:", error)
      }
    }

    return credited
  }

  /**
   * R13 (S13): a tarefa saiu de `done` por gestão. Reverte o crédito de quem o recebeu
   * (`users.points` + `currentMonthPoints` caem pelo mesmo total, sem piso — DEC-39) e baixa
   * `projects.points` pelo mesmo valor, com piso 0. Sem reversal injetada (publisher de teste),
   * devolve `null`: nada é tocado.
   */
  async onTaskUncompleted(event: TaskUncompletedEvent): Promise<number | null> {
    if (!event.userId || !event.taskId || !this.reversals) {
      return null
    }

    const outcome = await this.reversals.reverseTaskAward({
      userId: event.userId,
      taskId: event.taskId,
    })
    const reversed = typeof outcome?.reversedPoints === "number" ? outcome.reversedPoints : null

    // Mesmo par do `onTaskCompleted`: o projeto desce pelo valor efetivamente revertido. Zero não
    // escreve. Piso 0 é da escrita do adaptador de projects (DEC-74), não daqui.
    if (reversed !== null && reversed !== 0 && event.projectId && this.projectPoints) {
      try {
        await this.projectPoints.incrementProjectPoints(event.projectId, -reversed)
      } catch (error) {
        console.error("Erro ao reverter pontos do projeto na saída de task concluída:", error)
      }
    }

    return reversed
  }
}

export function createTaskProgressEvents(dependencies: {
  awards: TaskAwardPort
  projectPoints?: TaskProjectPointsPort
  reversals?: TaskReversalPort
}): TaskProgressEvents {
  return new GamificationTaskProgressEvents(
    dependencies.awards,
    dependencies.projectPoints,
    dependencies.reversals,
  )
}
