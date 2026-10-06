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

// ---------------------------------------------------------------------------
// plan-v4 · V4-4 — subtask (DEC-78)
// ---------------------------------------------------------------------------

/**
 * Uma subtask pontuável. `dueDate` é o prazo **da mãe**, herdado (D-D: subtask não tem prazo
 * próprio); `completedAt` é o instante em que a subtask foi concluída — não o da mãe.
 *
 * `completed` é obrigatório de propósito: "não pontuar uma subtask aberta" é a regra, e uma
 * assinatura onde a conclusão é opcional faria uma linha esquecida valer zero em silêncio.
 */
export interface AwardableSubtask {
  dueDate?: string | null;
  completed: boolean;
  completedAt?: Date | string | null;
}

/**
 * DEC-78 (substitui a fórmula gravada na DEC-56): cada subtask é pontuada pela **mesma regra da
 * mãe** — adiantada 15, no prazo 10, um dia atrasada 0, dois dias −10 — medida no instante em
 * que ela própria foi concluída. O dono escolheu esta leitura ao ver o exemplo medido: prazo
 * 20/10, mãe aprovada em 25/10, subtasks em 19/10, 21/10 e 24/10 → mãe −40, subtasks +15, 0, −30,
 * total **−55**.
 *
 * Duas consequências que precisam ficar escritas:
 *   - o atraso de uma subtask **não** é o atraso da mãe: uma subtask entregue no prazo vale 10
 *     mesmo que a mãe só seja aprovada cinco dias depois;
 *   - DEC-39 continua valendo sobre cada parcela: sem prazo, sem piso. Uma subtask concluída
 *     quatro dias atrasada **subtrai** 30 do prêmio da mãe.
 *
 * Sem `completedAt` a subtask é medida no instante em que a mãe é concluída — caminho defensivo
 * para linha antiga escrita antes de a coluna existir, não para comportamento normal.
 */
export function awardPointsForSubtask(subtask: AwardableSubtask, fallbackCompletion: Date): number {
  const parsed = subtask.completedAt ? new Date(subtask.completedAt) : null;
  const completion = parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallbackCompletion;
  return awardPointsForCompletion({ dueDate: subtask.dueDate ?? null }, completion);
}

/**
 * O que creditar quando a mãe termina: o prêmio da mãe **mais** o de cada subtask CONCLUÍDA
 * (DEC-78). Uma subtask aberta não entra na conta: ela ainda não representou trabalho feito.
 *
 * Com a trava (DEC-57) essa distinção seria inalcançável — nenhuma mãe termina com subtask
 * aberta. Ela existe no código porque a conta não pode depender de que a trava esteja sendo
 * aplicada em todo caminho, hoje e depois: se um caminho novo deixar uma mãe terminar aberta,
 * o resultado é não pagar o que não foi feito, e não pagar o que não foi feito.
 *
 * Sem subtask é exatamente `awardPointsForCompletion` — nada muda para tarefa simples, e é por
 * isso que os testes congelados da Onda 1 do plan-v3 continuam verdes.
 */
export function totalAwardForCompletion(
  task: AwardableTask,
  subtasks: ReadonlyArray<AwardableSubtask>,
  completionDate: Date,
): number {
  return (
    awardPointsForCompletion(task, completionDate) +
    subtasks.reduce(
      (sum, subtask) => (subtask.completed ? sum + awardPointsForSubtask(subtask, completionDate) : sum),
      0,
    )
  );
}
