/**
 * backend/domain/task/points-rules — premiação de conclusão (plan-v3 · Onda 1, batch 1.B).
 *
 * O que mudou em relação ao estado pré-v3 (caracterizado em
 * `tests/unit/modules/task-management/domain.points-characterization.test.ts`):
 *
 *   pré-v3   daysLate = ceil((completion − new Date(dueDate)) / 24h)  →  award = points − daysLate·points
 *   v3       dias inteiros de CALENDÁRIO em America/Sao_Paulo          →  award = 10 · (adiantada ? 1,5 : 1) − daysLate·10
 *   v4-ajuste (DEC-97, 2026-10-07)                                     →  award = (10 + 5·n) · (≥2 dias adiantada ? 1,5 : 1) − daysLate·10
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

/**
 * O que cada subtask SOMA à base da mãe (DEC-97, 2026-10-07 — ajuste do dono ao V4-4).
 * Substitui os 10 por subtask da DEC-56/DEC-83: a base gravada em `tasks.points` passa a ser
 * `10 + 5·n`. É valor FIXO — a subtask não tem pontuação própria pelo prazo (a DEC-78 morreu aqui).
 */
export const SUBTASK_POINTS = 5;

/**
 * Bônus de entrega antecipada: ×1,5 só com pelo menos `EARLY_DELIVERY_MIN_DAYS` dias civis de
 * antecedência (DEC-97). A DEC-32 pedia bônus para QUALQUER entrega antes do prazo; o dono
 * endureceu a régua para 2 dias, e a régua vale para toda tarefa, com ou sem subtask.
 */
export const EARLY_DELIVERY_MULTIPLIER = 1.5;
export const EARLY_DELIVERY_MIN_DAYS = 2;

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
 * Núcleo da premiação: um `base` (a regra da mãe, ou a da mãe já somada com as subtasks)
 * atravessando o mesmo calendário. Sem prazo o base fica inteiro; com prazo o calendário só
 * multiplica ou desconta.
 *
 * - sem prazo (ou ilegível) → o próprio base
 * - pelo menos 2 dias antes do prazo → base × 1,5 (DEC-97; a régua da DEC-32 era 1 dia)
 * - no dia do prazo ou 1 dia adiantado → base
 * - depois do prazo → base − diasAtrasados × 10, podendo ficar negativo (DEC-39, sem piso)
 */
function awardFromBase(base: number, task: AwardableTask, completionDate: Date): number {
  if (!task.dueDate) return base;
  const dueDay = civilDayOfDate(task.dueDate);
  if (!dueDay) return base;

  const completionDay = civilDayOfInstant(completionDate);
  const deltaDays = civilDaysBetween(dueDay, completionDay);

  if (deltaDays <= -EARLY_DELIVERY_MIN_DAYS) return Math.round(base * EARLY_DELIVERY_MULTIPLIER);
  if (deltaDays > 0) return base - deltaDays * POINTS_PER_TASK;
  return base;
}

/**
 * Pontos creditados por concluir a tarefa SEM subtask (a conta com subtask é
 * `totalAwardForCompletion`, mais abaixo).
 *
 * - sem prazo → 10
 * - 2 ou mais dias antes do prazo → 15 (10 × 1,5)
 * - no prazo ou 1 dia adiantado → 10
 * - depois do prazo → 10 − diasAtrasados × 10, podendo ficar negativo
 */
export function awardPointsForCompletion(task: AwardableTask, completionDate: Date): number {
  return awardFromBase(POINTS_PER_TASK, task, completionDate);
}

// ---------------------------------------------------------------------------
// plan-v4 · V4-4 — subtask (DEC-78 → substituída pela DEC-97)
// ---------------------------------------------------------------------------

/**
 * Uma subtask na conta de premiação. Só o que importa é se ela foi CONCLUÍDA: a subtask não
 * tem prazo próprio (D-D) e, desde a DEC-97, não tem pontuação própria — ela soma `SUBTASK_POINTS`
 * fixos à base da mãe.
 *
 * `completed` é obrigatório de propósito: "não pontuar uma subtask aberta" é a regra, e uma
 * assinatura onde a conclusão é opcional faria uma linha esquecida valer zero em silêncio.
 */
export interface AwardableSubtask {
  completed: boolean;
}

/**
 * O que creditar quando a mãe termina (DEC-97, ajuste do dono de 2026-10-07): a base
 * `10 + 5·n`, onde `n` é o número de subtasks CONCLUÍDAS, atravessando o mesmo calendário da
 * mãe — bônus ×1,5 com pelo menos 2 dias de antecedência, penalidade de 10 por dia de atraso
 * (DEC-39, sem piso).
 *
 * A subtask NÃO é mais pontuada pelo próprio prazo no instante da própria conclusão (a leitura
 * da DEC-78 — mãe −40, subtasks +15/0/−30 → −55 — morreu aqui, por decisão do dono): o que ela
 * faz é valer 5 quando concluída, e mais nada. O atraso da mãe é quem desconta, uma vez só.
 *
 * Subtask aberta não entra na conta: ela ainda não representou trabalho feito. Com a trava
 * (DEC-57) essa distinção seria inalcançável — nenhuma mãe termina com subtask aberta —, mas a
 * conta não pode depender de a trava estar aplicada em todo caminho: se um caminho novo deixar
 * uma mãe terminar aberta, o resultado é não pagar o que não foi feito.
 *
 * Sem subtask concluída o valor é exatamente `awardPointsForCompletion` — nada muda para tarefa
 * simples além da régua de 2 dias (que é de toda tarefa, subtask ou não).
 */
export function totalAwardForCompletion(
  task: AwardableTask,
  subtasks: ReadonlyArray<AwardableSubtask>,
  completionDate: Date,
): number {
  const completedCount = subtasks.reduce((count, subtask) => (subtask.completed ? count + 1 : count), 0);
  return awardFromBase(POINTS_PER_TASK + completedCount * SUBTASK_POINTS, task, completionDate);
}
