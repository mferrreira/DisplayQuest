/**
 * backend/domain/task/points-rules — premiação de conclusão (plan-v3 · Onda 1, batch 1.B).
 *
 * O que mudou em relação ao estado pré-v3 (caracterizado em
 * `tests/unit/modules/task-management/domain.points-characterization.test.ts`):
 *
 *   pré-v3   daysLate = ceil((completion − new Date(dueDate)) / 24h)  →  award = points − daysLate·points
 *   v3       dias inteiros de CALENDÁRIO em America/Sao_Paulo          →  award = 10 · (adiantada ? 1,5 : 1) − daysLate·10
 *
 * O efeito que originou o plano: `dueDate` entra como `YYYY-MM-DD` e virava meia-noite UTC,
 * então entregar no dia do prazo somava uma fração de 24h, `ceil` virava 1 e a penalidade comia
 * todos os pontos. Quem entregava no prazo recebia zero.
 *
 * O que foi preservado por decisão do dono (DEC-39): a penalidade **não tem piso**. Atraso
 * suficiente produz valor negativo e reduz o total de pontos da pessoa. A consequência está
 * escrita em PLAN.md §7 para não aparecer como surpresa.
 *
 * `task.points` deixou de entrar no cálculo (DEC-30, DEC-40): a coluna continua no schema como
 * histórico e o que foi creditado continua registrado em `task_user_progress.awardedPoints`.
 */

import { civilDayOfDate, civilDayOfInstant, civilDaysBetween } from "../time/civil-day";

/** Valor fixo de toda tarefa, editável em um único lugar (DEC-30). */
export const POINTS_PER_TASK = 10;

/** Entrega estritamente antes do dia do prazo (DEC-32). */
export const EARLY_DELIVERY_MULTIPLIER = 1.5;

/** `points` não é mais parâmetro da regra: manter o campo no tipo só registra o histórico. */
export interface AwardableTask {
  dueDate?: string | null;
}

/**
 * Dias de atraso em calendário do laboratório. 0 quando não há prazo, quando o prazo é hoje
 * ou quando a entrega é anterior ao prazo. Prazo ilegível conta como "sem prazo".
 */
export function daysLateForTask(task: AwardableTask, completionDate: Date): number {
  if (!task.dueDate) return 0;
  const dueDay = civilDayOfDate(task.dueDate);
  if (!dueDay) return 0;
  return Math.max(0, civilDaysBetween(dueDay, civilDayOfInstant(completionDate)));
}

/** Penalidade por atraso: `daysLate × POINTS_PER_TASK`, sem teto e sem piso (DEC-39). */
export function calculateLatePenalty(task: AwardableTask, completionDate: Date): number {
  return daysLateForTask(task, completionDate) * POINTS_PER_TASK;
}

/**
 * Pontos creditados por concluir a tarefa.
 *
 * - sem prazo → 10
 * - antes do dia do prazo → 15 (10 × 1,5)
 * - no dia do prazo → 10
 * - depois do dia do prazo → 10 − diasAtrasados × 10, podendo ficar negativo
 */
export function awardPointsForCompletion(task: AwardableTask, completionDate: Date): number {
  if (!task.dueDate) return POINTS_PER_TASK;
  const dueDay = civilDayOfDate(task.dueDate);
  if (!dueDay) return POINTS_PER_TASK;

  const completionDay = civilDayOfInstant(completionDate);
  const deltaDays = civilDaysBetween(dueDay, completionDay);

  if (deltaDays < 0) return Math.round(POINTS_PER_TASK * EARLY_DELIVERY_MULTIPLIER);
  return POINTS_PER_TASK - deltaDays * POINTS_PER_TASK;
}
