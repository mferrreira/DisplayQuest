import { buildAwardDescription } from "@/backend/domain"
import type { GamificationAwardHistoryPort } from "@/backend/modules/gamification/application/ports/gamification-award-history.port"

/**
 * ReverseTaskAwardUseCase — R13 (S13, ADR-004).
 *
 * A tarefa saiu de `done` por gestão (R12). O valor creditado naquela tarefa é retirado de
 * quem o recebeu: `users.points` e `currentMonthPoints` descem pelo mesmo total, sem piso
 * (DEC-39), a linha original de premiação é consumida (re-aprovar volta a premiar) e a
 * reversão entra no `history` como `GAMIFICATION:TASK_REVERSED:<taskId>`.
 *
 * Dedução idempotente: a transição `done→out` deducta uma vez (I3). A chave original é
 * consumida, não apagada pela limpeza de feed (I2 — a limpeza só recorta `entityType task`).
 *
 * Devolve `null` quando não havia prêmio ativo para este par — a transição não tem o que
 * deduzir, e o projeto não é tocado. A escrita em `projects.points` (piso 0, DEC-74) é do
 * chamador (a tarefa guarda o projeto), não daqui: gamification não conhece projeto.
 */
export interface ReverseTaskAwardCommand {
  userId: number
  taskId: number
}

export class ReverseTaskAwardUseCase {
  constructor(private readonly awardHistory: GamificationAwardHistoryPort) {}

  async execute(command: ReverseTaskAwardCommand): Promise<{ reversedPoints: number } | null> {
    const reverse = this.awardHistory.reverseTaskAward
    if (!reverse) return null
    return reverse.call(this.awardHistory, {
      userId: command.userId,
      taskId: command.taskId,
      originalAwardDescription: buildAwardDescription("TASK_COMPLETED", command.taskId),
      reversalDescription: buildAwardDescription("TASK_REVERSED", command.taskId),
    })
  }
}
