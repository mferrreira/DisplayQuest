import type { ActorRef, GamificationSourceType, MonthKey, WeekKey, XpAdjustment } from "@/backend/domain"

/**
 * O vocabulário é o do domínio (`Progression.ts`) — re-exportado, não copiado. A cópia local
 * tinha 3 membros e o domínio ganhou `ACTIVITY_COMPLETED` no V5-7b (DEC-63/104): vocabulário
 * em duas cópias é vocabulário mentindo em uma delas (lição DEC-95/96).
 */
export type { GamificationSourceType }

export interface AwardFromWorkSessionCommand {
  userId: number
  workSessionId: number
  durationSeconds?: number | null
  completedTaskIds?: number[]
}

export interface AwardFromTaskCompletionCommand {
  userId: number
  taskId: number
  /** GAP-04 (fecha em OND6-B2): null era aceito em runtime (default 10) sem estar no tipo. */
  taskPoints?: number | null
}

/**
 * V5-7b (DEC-63/103/104): o prêmio da atividade aprovada, na parcela que a distribuição do
 * domínio de projeto calculou. Diferença deliberada em relação à tarefa: aqui o valor NÃO é
 * recomputado pela gamification — a escala é própria do projeto (DEC-103) e quem decide é
 * `activity-rules.ts`; a gamification credita, idempotente por (usuário, descrição).
 */
export interface AwardFromActivityCompletionCommand {
  userId: number
  activityId: number
  points: number
}

export interface UserProgression {
  userId: number
  points: number
  xp: number
  level: number
  elo: string
  nextLevelXp: number
  progressToNextLevel: number
}

export interface GamificationAwardResult {
  userId: number
  sourceType: GamificationSourceType
  sourceId: number
  pointsAwarded: number
  xpAwarded: number
  newProgression: UserProgression
  alreadyAwarded: boolean
}

export interface BadgeCriteriaInput {
  points?: number
  tasks?: number
  projects?: number
  workSessions?: number
  weeklyHours?: number
  consecutiveDays?: number
  specialCondition?: string
}

export interface CreateBadgeCommand {
  name: string
  description: string
  category: "achievement" | "milestone" | "special" | "social"
  icon?: string | null
  color?: string | null
  criteria?: BadgeCriteriaInput | null
  isActive?: boolean
  createdBy: number
}

export interface UpdateBadgeCommand {
  id: number
  data: Partial<CreateBadgeCommand>
}

export interface AwardBadgeCommand {
  badgeId: number
  userId: number
  awardedBy?: number
  /**
   * D4/B6-2c (DEC-54/DEC-115): quem concede. O gate de MANAGE_USERS mora no use case — a rota
   * só constrói o ator a partir da sessão.
   */
  actor: ActorRef
}

/**
 * plan-v8 V8-2 (DEC-212) — o fechamento mensal do placar. `now` entra por parâmetro de propósito
 * (lição DEC-132): o mês a fechar é aritmética de dia civil do instante da run, e só o chamador
 * sabe que instante é "agora". Regra nenhuma lê `new Date()`.
 */
export interface ResetMonthlyPointsCommand {
  actor: ActorRef
  now: Date
}

export type MonthlyCloseStatus = "closed" | "already-closed" | "without-activity"

export interface MonthlyCloseOutcome {
  userId: number
  name: string
  month: MonthKey
  /** O saldo fotografado — pode ser negativo (DEC-39). */
  points: number
  completedTasksOfMonth: number
  status: MonthlyCloseStatus
}

export interface ResetMonthlyPointsResult {
  month: MonthKey
  closed: number
  alreadyClosed: number
  skippedWithoutActivity: number
  outcomes: MonthlyCloseOutcome[]
}

/**
 * plan-v8 V8-3 (DEC-214): a revisão semanal de XP. Mesma forma do comando do reset mensal — `now`
 * entra por parâmetro e a semana a fechar é aritmética de dia civil (`xpClosedWeekOfInstant`).
 */
export interface ReviewWeeklyXpCommand {
  actor: ActorRef
  now: Date
}

export type WeeklyXpReviewStatus = "adjusted" | "already-reviewed" | "without-adjustment"

export interface WeeklyXpReviewOutcome {
  userId: number
  name: string
  weekStart: WeekKey
  status: WeeklyXpReviewStatus
  /**
   * Os itens da decisão, um por regra que bateu (boost de constância, penalidade de tarefa atrasada,
   * ...). A soma é `netAmount`; o item a item é o que permite ao ledger registrar a DECISÃO e não só
   * o número, que é o que o livro-caixa da temporada (V8-4) vai ler.
   */
  adjustments: XpAdjustment[]
  netAmount: number
  xpBefore: number
  /** Depois do piso 0 (DEC-214): nunca negativo. */
  xpAfter: number
}

export interface ReviewWeeklyXpResult {
  weekStart: WeekKey
  adjusted: number
  alreadyReviewed: number
  withoutAdjustment: number
  outcomes: WeeklyXpReviewOutcome[]
}
