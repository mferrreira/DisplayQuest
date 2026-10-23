import type { WeekKey, XpAdjustment } from "@/backend/domain/gamification";

/**
 * WeeklyXpReviewPort — plan-v8 V8-3 (DEC-214). O que a revisão semanal de XP lê e escreve.
 *
 * A port devolve FATOS contados, nunca decisão: "quantos dias da semana tiveram sessão",
 * "quantas tarefas atrasadas" — a aritmética (boosts, substituição do boost, penalidades, piso) é
 * toda de `xp-rules.ts`, e o use case é quem a aplica. É o desenho já medido no fechamento mensal
 * (V8-2): o adaptador conta com as condições que o sistema já usa para creditar, e o domínio decide.
 *
 * As contagens de tarefa usam as DUAS famílias que creditam `users.completedTasks` — a conclusão
 * individual (`task_user_progress.completedAt`, caminho pública/global) e a aprovação da tarefa
 * delegada (`tasks.completedAt` do responsável, `isGlobal: false` e `taskVisibility != "public"`).
 * Constância, boost e penalidade tem que olhar o mesmo conjunto que o sistema já credita; duas
 * contas de "tarefas da semana" divergiriam em silêncio.
 */

export interface WeeklyReviewCandidate {
  userId: number;
  name: string;
  /** XP corrente da temporada (o piso é aplicado sobre ele). */
  xp: number;
  /** `users.weekHours` — a meta declarada. Zero significa "sem meta", e meta zero não cobra. */
  weekHoursGoal: number;
}

/** Os fatos da semana contados pelo adaptador (a meta vem do candidato, não daqui). */
export interface WeeklyXpDataFacts {
  /** Dias civis da semana com pelo menos uma sessão concluída. */
  daysWithSession: number;
  tasksApproved: number;
  tasksLate: number;
  /** Atividades aprovadas na semana, atrasadas, em que a pessoa recebeu distribuição. */
  activitiesLate: number;
  /** Atividades aprovadas na semana sem sessão da pessoa no período da atividade. */
  activitiesWithoutSession: number;
  /** Horas de sessão concluída na semana. */
  hoursWorked: number;
}

export interface WeeklyXpWindow {
  start: Date;
  endExclusive: Date;
}

export interface WeeklyXpReviewWrite {
  userId: number;
  weekStart: WeekKey;
  /** A chave de reexecução: `GAMIFICATION:XP:WEEKLY_REVIEW:<userId>:<weekStart>`. */
  description: string;
  adjustments: XpAdjustment[];
  netAmount: number;
}

export interface WeeklyXpApplyResult {
  /** `false` quando a semana já tinha linha de revisão (backstop da corrida, dentro da transação). */
  applied: boolean;
  xpBefore: number;
  xpAfter: number;
}

export interface WeeklyXpReviewPort {
  listUsersForWeeklyReview(): Promise<WeeklyReviewCandidate[]>;
  hasWeeklyReview(userId: number, weekStart: WeekKey): Promise<boolean>;
  getWeeklyFacts(userId: number, window: WeeklyXpWindow): Promise<WeeklyXpDataFacts>;
  applyWeeklyXpAdjustment(write: WeeklyXpReviewWrite): Promise<WeeklyXpApplyResult>;
}
