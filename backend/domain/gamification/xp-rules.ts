/**
 * backend/domain/gamification/xp-rules.ts — o motor de XP da temporada (plan-v8 V8-3, DEC-214).
 *
 * XP é a trilha do VOLUME BRUTO da temporada anual (MODELO §4): o que a pessoa fez, com boost de
 * constância/produtividade e penalidade, com aritmética própria e constantes planas — nada aqui
 * deriva de `points`. A coluna `users.xp` (V8-1) é o que estas regras escrevem; o elo (V8-6) é o
 * que as lê.
 *
 * Duas cadências:
 *   - **evento** (+10 tarefa aprovada, +10 sessão concluída, +20 atividade aprovada POR MEMBRO):
 *     valor fixo por evento, creditado junto do prêmio correspondente;
 *   - **revisão semanal** (boosts e penalidades da semana civil que fechou), decidida aqui e
 *     aplicada pela rotina do cron com ator de sistema.
 *
 * Semana = semana CIVIL segunda 00:00 → +7 dias em America/Sao_Paulo, ancorada nas MESMAS funções
 * de dia civil do domínio (`civilDayOfInstant`/`startOfCivilDayInstant`) que cortam o mês (V8-2) e
 * o feed de atividade (V6-11k). Não é a janela de `date-fns` com `weekStartsOn: 1` do relatório de
 * horas (QUIRK-7B, relógio local da máquina): a regra de XP é aritmética de calendário do
 * laboratório e por isso declara a própria janela — medida em teste.
 *
 * O `now` entra por parâmetro em toda regra (DEC-132): regra nenhuma lê `new Date()`.
 */
import { civilDayOfInstant, startOfCivilDayInstant } from "@/backend/domain/time/civil-day";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Grafia da chave de semana civil: a segunda de abertura, `2026-10-19`. */
export type WeekKey = string;

export const WEEK_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ─── volume por evento (MODELO §4, rodada 6: constantes planas) ────────────────────────────────

/** Tarefa aprovada (o `done` de verdade: conclusão direta ou aprovação da entrega). */
export const XP_EVENT_TASK_COMPLETED = 10;

/** Sessão de trabalho concluída (o fim do caminho de premiação de sessão). */
export const XP_EVENT_WORK_SESSION = 10;

/** Atividade de cronograma aprovada — POR MEMBRO da distribuição (DEC-164), não por atividade. */
export const XP_EVENT_ACTIVITY_COMPLETED = 20;

/**
 * A chave de idempotência do credit de XP. O prefixo `GAMIFICATION:XP:` separa a trilha; o
 * sourceType entra na chave porque os `sourceId` vêm de tabelas diferentes e colidiriam — tarefa 5
 * e sessão 5 são coisas diferentes, e `GAMIFICATION:XP:5` seria um credit a menos.
 */
export function xpAwardDescription(sourceType: string, sourceId: number): string {
  return `GAMIFICATION:XP:${sourceType}:${sourceId}`;
}

/** A marca de revisão da semana: a guarda de reexecução do `ReviewWeeklyXpUseCase`. */
export function weeklyXpReviewDescription(userId: number, weekStart: WeekKey): string {
  return `GAMIFICATION:XP:WEEKLY_REVIEW:${userId}:${weekStart}`;
}

// ─── boosts semanais ───────────────────────────────────────────────────────────────────────────

/** Constância: os SETE dias civis da semana tiveram sessão concluída. */
export const XP_WEEK_DAYS_WITH_SESSION_MIN = 7;
export const XP_BOOST_WEEK_DAYS = 40;

/** Produtividade: 5+ tarefas aprovadas na semana. */
export const XP_WEEK_TASKS_MEDIUM_MIN = 5;
export const XP_BOOST_TASKS_MEDIUM = 20;

/** Produtividade maior: 10+ tarefas na semana. SUBSTITUI o boost de 5+, nunca soma com ele. */
export const XP_WEEK_TASKS_HIGH_MIN = 10;
export const XP_BOOST_TASKS_HIGH = 40;

/** O boost de tarefas da semana: o degrau mais alto alcançado, um só. */
export function weeklyTasksBoost(tasksApproved: number): number {
  if (tasksApproved >= XP_WEEK_TASKS_HIGH_MIN) return XP_BOOST_TASKS_HIGH;
  if (tasksApproved >= XP_WEEK_TASKS_MEDIUM_MIN) return XP_BOOST_TASKS_MEDIUM;
  return 0;
}

/** O boost de constância da semana. */
export function weeklyConsistencyBoost(daysWithSession: number): number {
  return daysWithSession >= XP_WEEK_DAYS_WITH_SESSION_MIN ? XP_BOOST_WEEK_DAYS : 0;
}

// ─── penalidades semanais ──────────────────────────────────────────────────────────────────────

/** Tarefa atrasada: −10 FLAT por tarefa (diferente do −10/dia do prêmio, DEC-39 — é outra trilha). */
export const XP_PENALTY_TASK_LATE = -10;

/** Atividade atrasada: −20 por membro que recebeu a distribuição. */
export const XP_PENALTY_ACTIVITY_LATE = -20;

/** Atividade aprovada sem sessão do membro no período da atividade: −30 por membro. */
export const XP_PENALTY_ACTIVITY_WITHOUT_SESSION = -30;

/** Meta semanal não cumprida: −20. Só quando existe meta (`weekHours > 0`). */
export const XP_PENALTY_WEEKLY_GOAL = -20;

/** A meta existe quando foi declarada: `weekHours > 0`. Meta zero não cobra nada. */
export function weeklyGoalMissed(input: { weekHoursGoal: number; hoursWorked: number }): boolean {
  return input.weekHoursGoal > 0 && input.hoursWorked < input.weekHoursGoal;
}

// ─── piso ──────────────────────────────────────────────────────────────────────────────────────

/** XP nunca abaixo de 0 (piso por pessoa, dentro da temporada). */
export const XP_FLOOR = 0;

export function applyXpFloor(currentXp: number, delta: number): number {
  return Math.max(XP_FLOOR, currentXp + delta);
}

// ─── a revisão da semana que fechou ────────────────────────────────────────────────────────────

/**
 * Os fatos da semana, contados pela port (o adaptador conta; a aritmética é daqui). As contagens
 * de tarefa são as DUAS famílias que creditam `users.completedTasks` (a mesma medida do fechamento
 * mensal V8-2) — constância, boost e penalidade de tarefa têm que olhar o mesmo conjunto que o
 * sistema já credita.
 */
export interface XpWeeklyFacts {
  /** Dias civis da semana com pelo menos uma sessão concluída. */
  daysWithSession: number;
  /** Tarefas aprovadas na semana. */
  tasksApproved: number;
  /** Delas, as que foram entregues depois do prazo. */
  tasksLate: number;
  /** Atividades aprovadas na semana, atrasadas, em que esta pessoa recebeu distribuição. */
  activitiesLate: number;
  /** Atividades aprovadas na semana em que esta pessoa não tem sessão no período da atividade. */
  activitiesWithoutSession: number;
  /** Horas de sessão concluída na semana. */
  hoursWorked: number;
  /** A meta declarada da pessoa (`users.weekHours`). */
  weekHoursGoal: number;
}

export type XpAdjustmentCode =
  | "WEEK_DAYS_SESSION"
  | "TASKS_MEDIUM"
  | "TASKS_HIGH"
  | "TASKS_LATE"
  | "ACTIVITIES_LATE"
  | "ACTIVITIES_WITHOUT_SESSION"
  | "WEEKLY_GOAL";

/**
 * `type` e não `interface` de propósito: o ajuste entra como `newValues` da linha de `history`, e o
 * `InputJsonValue` do Prisma não aceita array de interface (falta o index signature). Alias de type
 * resolve isso sem cast no adaptador.
 */
export type XpAdjustment = {
  code: XpAdjustmentCode;
  /** Quantas unidades entraram na conta (tarefas, atividades, dias). */
  units: number;
  /** O efeito total na trilha: unidades × constante. Boost é positivo, penalidade negativa. */
  amount: number;
};

/**
 * Os ajustes da semana, na ordem em que aparecem no MODELO §4 (boosts, depois penalidades). Item
 * com zero unidades não entra: a linha de `history` registra o que aconteceu, não um 0 por linha.
 */
export function weeklyXpAdjustments(facts: XpWeeklyFacts): XpAdjustment[] {
  const items: XpAdjustment[] = [];

  const consistency = weeklyConsistencyBoost(facts.daysWithSession);
  if (consistency !== 0) {
    items.push({ code: "WEEK_DAYS_SESSION", units: facts.daysWithSession, amount: consistency });
  }

  const tasksBoost = weeklyTasksBoost(facts.tasksApproved);
  if (tasksBoost === XP_BOOST_TASKS_HIGH) {
    items.push({ code: "TASKS_HIGH", units: facts.tasksApproved, amount: tasksBoost });
  } else if (tasksBoost === XP_BOOST_TASKS_MEDIUM) {
    items.push({ code: "TASKS_MEDIUM", units: facts.tasksApproved, amount: tasksBoost });
  }

  if (facts.tasksLate > 0) {
    items.push({ code: "TASKS_LATE", units: facts.tasksLate, amount: facts.tasksLate * XP_PENALTY_TASK_LATE });
  }
  if (facts.activitiesLate > 0) {
    items.push({
      code: "ACTIVITIES_LATE",
      units: facts.activitiesLate,
      amount: facts.activitiesLate * XP_PENALTY_ACTIVITY_LATE,
    });
  }
  if (facts.activitiesWithoutSession > 0) {
    items.push({
      code: "ACTIVITIES_WITHOUT_SESSION",
      units: facts.activitiesWithoutSession,
      amount: facts.activitiesWithoutSession * XP_PENALTY_ACTIVITY_WITHOUT_SESSION,
    });
  }
  if (weeklyGoalMissed({ weekHoursGoal: facts.weekHoursGoal, hoursWorked: facts.hoursWorked })) {
    items.push({ code: "WEEKLY_GOAL", units: 1, amount: XP_PENALTY_WEEKLY_GOAL });
  }

  return items;
}

/** O efeito somado da semana sobre a trilha (pode ser negativo; o piso é aplicado por pessoa). */
export function netXpAdjustment(items: ReadonlyArray<XpAdjustment>): number {
  return items.reduce((total, item) => total + item.amount, 0);
}

// ─── a semana civil do laboratório ─────────────────────────────────────────────────────────────

function civilMonday(weekStart: WeekKey): Date {
  if (!WEEK_KEY_PATTERN.test(weekStart)) {
    throw new Error(`weekStart inválido: ${weekStart} (esperado YYYY-MM-DD)`);
  }
  const [year, month, day] = weekStart.split("-").map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day, 12));
  if (asUtc.getUTCDay() !== 1) {
    throw new Error(`weekStart precisa ser uma segunda-feira: ${weekStart}`);
  }
  return asUtc;
}

/** A segunda que abre a semana civil do instante, vista em America/Sao_Paulo. */
export function currentXpWeekStartOfInstant(instant: Date): WeekKey {
  const day = civilDayOfInstant(instant);
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, dayOfMonth));
  const daysFromMonday = (asUtc.getUTCDay() + 6) % 7;
  const monday = new Date(asUtc.getTime() - daysFromMonday * DAY_MS);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

function shiftWeek(weekStart: WeekKey, weeks: number): WeekKey {
  const monday = civilMonday(weekStart);
  const shifted = new Date(monday.getTime() + weeks * WEEK_DAYS * DAY_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * A semana que a run de revisão fecha: a anterior à do instante da run. O job roda segunda às
 * 00:10 — a semana civil nova acabou de começar, e a que fechou é a que vai de segunda passada a
 * esta segunda.
 */
export function xpClosedWeekOfInstant(instant: Date): WeekKey {
  return shiftWeek(currentXpWeekStartOfInstant(instant), -1);
}

/**
 * Janela da semana em instantes UTC, meia-noite de America/Sao_Paulo nos dois cortes:
 * `[start, endExclusive)` de sete dias. O corte de fim é exclusivo (a mesma escolha do mês, V8-2):
 * o instante das 00:00 da segunda seguinte é da semana nova, e nenhum instante fica fora das duas.
 */
export function xpWeekWindow(weekStart: WeekKey): { start: Date; endExclusive: Date } {
  const monday = civilMonday(weekStart);
  return {
    start: startOfCivilDayInstant(monday),
    endExclusive: startOfCivilDayInstant(new Date(monday.getTime() + WEEK_DAYS * DAY_MS)),
  };
}

/** Quantos dias civis tem a janela (a régua de constância é 7/7; a função congela o "7"). */
export function xpWeekDayCount(weekStart: WeekKey): number {
  const { start, endExclusive } = xpWeekWindow(weekStart);
  return Math.round((endExclusive.getTime() - start.getTime()) / DAY_MS);
}
