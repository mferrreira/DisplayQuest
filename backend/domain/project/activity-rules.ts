/**
 * Economia da atividade concluída — V5-7b (DEC-63/74/76/77/103/104/163/164).
 *
 * É a casa que o comentário do V5-5 prometeu (`cronograma-rules.ts:22`: "a economia é
 * activity-rules.ts, no V5-7"): prêmio da aprovação, atribuição de tarefa por membro e
 * distribuição Hamilton. Regras puras — `now` entra por parâmetro (casa), banco nunca.
 *
 * As frases e transições do fluxo de solicitar estão em `activity-completion-rules.ts`
 * (V5-7a); aqui só há aritmética e decisão de fase.
 */

import { civilDaysBetween } from "../time/civil-day";
import { GLOBAL_PROJECT_MANAGERS } from "./project-rules";
import { activityPeriod, activityReward } from "./cronograma-rules";
import type { ActivityStatus } from "./cronograma-rules";

/**
 * Régua de antecedência da DEC-103: "×1,5 com ≥2 dias civis (mesma régua da DEC-97)".
 * O valor é o mesmo do domínio de tarefa (`EARLY_DELIVERY_MIN_DAYS`) por decisão, não por
 * import — os dois domínios têm escalas próprias (DEC-103) e cada um congela o seu em teste.
 */
export const ACTIVITY_EARLY_APPROVAL_MIN_DAYS = 2;

/** DEC-103: atraso cobra FRAÇÃO da recompensa por dia — mais pesado que o −10/dia do usuário. */
export const ACTIVITY_LATE_PENALTY_RATE_PER_DAY = 0.1;

/**
 * Prêmio da aprovação (DEC-103/74). O prazo da linha é o `periodoFim` derivado (último dia
 * do último mês marcado — DEC-126a), e o dia comparado é data civil do instante de aprovação
 * (`civilDayOfInstant` no fuso do laboratório, DEC-132).
 *
 *   antecipada ≥ 2 dias civis  → base × 1,5 (Math.round — a aritmética fracionária da casa)
 *   no prazo (0 a 1 dia antes) → base
 *   atrasada                   → base − 10% × dias, PISO 0 (DEC-74)
 */
export function activityCompletionAward(input: {
  firstMonth: string;
  lastMonth: string;
  approvedDay: string;
}): number {
  const base = activityReward(input.firstMonth, input.lastMonth);
  const { periodoFim } = activityPeriod(input.firstMonth, input.lastMonth);
  const daysFromDeadline = civilDaysBetween(periodoFim, input.approvedDay);

  if (daysFromDeadline <= -ACTIVITY_EARLY_APPROVAL_MIN_DAYS) {
    return Math.round(base * 1.5);
  }
  if (daysFromDeadline > 0) {
    return Math.max(0, Math.round(base - base * ACTIVITY_LATE_PENALTY_RATE_PER_DAY * daysFromDeadline));
  }
  return base;
}

/**
 * Atribuição DEC-163 (três juízes Big Pickle, unânimes): "tasks que o membro concluiu no
 * projeto" é o conjunto de tarefas concluídas onde o membro é responsável (task_assignees) OU
 * completou tarefa pública (task_user_progress), DEDUPLICADO por par (membro, tarefa) e sem
 * peso pelo número de responsáveis. Tarefa com dois responsáveis dá um crédito a cada um —
 * nunca dois ao mesmo.
 */
export interface CompletedTaskCredit {
  taskId: number;
  assigneeIds: number[];
  completerIds: number[];
}

export function memberTaskCredits(
  tasks: ReadonlyArray<CompletedTaskCredit>,
): Map<number, number> {
  const credits = new Map<number, number>();
  for (const task of tasks) {
    const participants = new Set<number>([...task.assigneeIds, ...task.completerIds]);
    for (const userId of participants) {
      credits.set(userId, (credits.get(userId) ?? 0) + 1);
    }
  }
  return credits;
}

/**
 * Distribuição DEC-104/164 (três juízes Big Pickle, unânimes): Hamilton de maior resto.
 *
 *   parte exata_i = award × tasks_i ÷ Σ tasks (a conta é sobre os membros que entram na
 *   distribuição — o denominador é a soma dos créditos DELES; a leitura literal
 *   "tasks do projeto" diluiria o prêmio até ele sumir quando todos os contribuidores saíram,
 *   e a regra congelada "soma das partes == prêmio" vence, DEC-165)
 *   floor primeiro; restos distribuídos um a um aos maiores restos fracionários;
 *   desempate: (resto desc, tasks desc, menor userId);
 *   membro com zero tasks nunca recebe resto;
 *   denominador 0 → divisão igual entre os que entram (DEC-104), pela mesma aritmética.
 *
 * Todo ramo fecha com Σ partes == award — congelado em teste.
 */
export interface ActivityAwardMember {
  userId: number;
  completedTasks: number;
}

export function distributeActivityAward(
  award: number,
  members: ReadonlyArray<ActivityAwardMember>,
): Map<number, number> {
  const shares = new Map<number, number>();
  if (members.length === 0) return shares;

  const totalTasks = members.reduce((sum, member) => sum + member.completedTasks, 0);
  const exact = (member: ActivityAwardMember) =>
    totalTasks === 0 ? award / members.length : (award * member.completedTasks) / totalTasks;

  let assigned = 0;
  for (const member of members) {
    const share = Math.floor(exact(member));
    shares.set(member.userId, share);
    assigned += share;
  }

  let seats = award - assigned;
  if (seats > 0) {
    const ranked = [...members].sort((a, b) => {
      const remainderA = exact(a) - Math.floor(exact(a));
      const remainderB = exact(b) - Math.floor(exact(b));
      if (remainderB !== remainderA) return remainderB - remainderA;
      if (b.completedTasks !== a.completedTasks) return b.completedTasks - a.completedTasks;
      return a.userId - b.userId;
    });
    for (const member of ranked) {
      if (seats <= 0) break;
      // Membro com zero tasks nunca recebe resto — na divisão igual (denominador 0) todos
      // entram, e é o único ramo em que o resto vai a quem não tem tarefa.
      if (totalTasks > 0 && member.completedTasks === 0) continue;
      shares.set(member.userId, (shares.get(member.userId) ?? 0) + 1);
      seats -= 1;
    }
  }

  return shares;
}

/**
 * Gate de APROVAR (DEC-76/77): só `GLOBAL_PROJECT_MANAGERS` (COORDENADOR/GERENTE globais).
 * Auto-aprovação só COORDENADOR — GERENTE não aprova o que ele mesmo solicitou. Se quem
 * pediu foi apagado (`requestedBy` SetNull, DEC-155), não há conflito de auto-aprovação.
 */
export function canActorApproveActivityCompletionDecision(
  actorId: number,
  actorRoles: ReadonlyArray<string>,
  requestedBy: number | null,
): boolean {
  const isGlobalManager = actorRoles.some((role) =>
    (GLOBAL_PROJECT_MANAGERS as readonly string[]).includes(role),
  );
  if (!isGlobalManager) return false;
  if (requestedBy !== null && actorId === requestedBy) {
    return actorRoles.includes("COORDENADOR");
  }
  return true;
}

/** De que status a fase de aprovar aceita partir (DEC-76: COMPLETION_REQUESTED → DONE). */
export function isActivityApprovable(status: ActivityStatus): boolean {
  return status === "COMPLETION_REQUESTED";
}

/** A frase do 409 da aprovação — mesma gramática da fase de solicitar (DEC-162). */
export function activityApproveConflictMessage(status: ActivityStatus): string {
  if (status === "OPEN") return "A conclusão desta atividade ainda não foi solicitada";
  return "Esta atividade já foi concluída";
}
