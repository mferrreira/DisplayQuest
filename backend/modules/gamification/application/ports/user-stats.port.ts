/**
 * UserStatsPort — OND6-B2. Amostras BRUTAS que as regras puras agregam
 * (averageWeeklyHoursFrom / maxConsecutiveDaysFrom em domain/gamification/badge-rules).
 * O recorte "4 semanas mais recentes" e a ordem das daily_logs sao queries congeladas
 * pelo golden OND6-B1 e pertencem ao adapter.
 */

export interface WeeklyHoursSample {
  totalHours: number;
}

export interface ClosedSeasonSums {
  /** Somatório de `month_history.points` dos meses fechados do ano. */
  points: number;
  /** Somatório de `month_history.completedTasks` dos meses fechados do ano. */
  completedTasks: number;
}

export interface UserStatsPort {
  projectsCount(userId: number): Promise<number>;
  workSessionsCount(userId: number): Promise<number>;
  /** orderBy weekStart desc, take 4 (frozen golden). */
  weeklyHoursSamples(userId: number): Promise<WeeklyHoursSample[]>;
  /** orderBy date asc (frozen golden). */
  dailyLogDates(userId: number): Promise<Date[]>;
  /**
   * V8-6 (DEC-219): as tarefas do mês EM CURSO, pela mesma conta do fechamento mensal (V8-2) — as
   * DUAS famílias que creditam `users.completedTasks`. A janela `mes` do critério mede o mês em
   * curso, e o snapshot dele ainda não existe: ele só nasce no fechamento. Usar o snapshot aqui
   * faria o critério de mês estar sempre um mês atrasado.
   */
  countTasksCompletedSince(userId: number, window: { start: Date; endExclusive: Date }): Promise<number>;
  /**
   * V8-6 (DEC-219): o que o livro de meses do ano já fotografou. O mês em curso entra na soma da
   * temporada pelo caminho da coluna (o use case soma o placar vivo), não por aqui — aqui é só o
   * que já tem linha em `month_history`.
   */
  closedSeasonSums(userId: number, year: number): Promise<ClosedSeasonSums>;
}
