import type { ActorRef, GamificationSourceType, GamificationTrack, MonthKey, SeasonKey, WeekKey, XpAdjustment } from "@/backend/domain"

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
  /**
   * V8-5 (DEC-215): a parcela da distribuição Hamilton agora fala de MOEDA — é o valor do prêmio
   * de atividade (100 × meses, ×1,5 antecipada, −10%/dia com piso 0, DEC-103/74) na parte que
   * toca ao membro. O nome do campo seguiu o destino: o valor entra em `users.coins`.
   */
  coins: number
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
  /**
   * Montante creditado na trilha declarada abaixo, na coluna de saldo de `users`. Antes o campo
   * era `pointsAwarded` e o destino era um só; o prêmio de atividade mudou de trilha (V8-5) e o
   * nome único teria mentido sobre o destino (DEC-215). 0 quando o award já estava registrado.
   */
  amountAwarded: number
  /** Trilha do credit: POINTS (tarefa, sessão) ou COINS (atividade aprovada). */
  track: GamificationTrack
  /** Credit da trilha XP da temporada, escrito na mesma transação (DEC-214). */
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

/**
 * plan-v8 V8-4 (DEC-213): o fechamento da temporada anual. Mesma forma dos dois comandos de ciclo
 * anteriores — `now` entra por parâmetro e o ano a fechar vem da aritmética de dia civil
 * (`closingSeasonYearOfInstant`). O chamador de hoje é o cron com `systemActor`; o gate já monta o
 * caminho de disparo manual do painel (Q12 do modelo) sem rota nova.
 */
export interface CloseSeasonCommand {
  actor: ActorRef
  now: Date
}

export type SeasonCloseStatus = "closed" | "already-closed" | "without-activity"

export interface SeasonCloseOutcome {
  userId: number
  name: string
  year: SeasonKey
  status: SeasonCloseStatus
  /**
   * O somatório dos `month_history` do ano — não o saldo da coluna. Na reexecução a coluna já está
   * zerada e o que se reporta é o que o livro diz.
   */
  points: number
  completedTasks: number
  xp: number
  /** Posição na temporada (1 = CAMPEÃO). Nula para quem não entrou no livro. */
  position: number | null
}

/**
 * O troféu do ano. `sem-participante` é o estado de uma temporada cujo livro-caixa ficou vazio —
 * ninguém fecha, ninguém é campeão. `badge-ausente` é o estado do catálogo sem o troféu: as linhas de
 * temporada continuam escritas e a rotina loga o aviso.
 */
export type SeasonChampionStatus = "awarded" | "already-awarded" | "badge-ausente" | "sem-participante"

export interface SeasonChampionResult {
  userId: number | null
  name: string | null
  points: number
  badgeId: number | null
  status: SeasonChampionStatus
}

export interface CloseSeasonResult {
  year: SeasonKey
  closed: number
  alreadyClosed: number
  skippedWithoutActivity: number
  outcomes: SeasonCloseOutcome[]
  champion: SeasonChampionResult
}
