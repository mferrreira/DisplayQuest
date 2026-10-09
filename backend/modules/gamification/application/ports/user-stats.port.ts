/**
 * UserStatsPort — OND6-B2. Amostras BRUTAS que as regras puras agregam
 * (averageWeeklyHoursFrom / maxConsecutiveDaysFrom em domain/gamification/badge-rules).
 * O recorte "4 semanas mais recentes" e a ordem das daily_logs sao queries congeladas
 * pelo golden OND6-B1 e pertencem ao adapter.
 */

export interface WeeklyHoursSample {
  totalHours: number;
}

export interface UserStatsPort {
  projectsCount(userId: number): Promise<number>;
  workSessionsCount(userId: number): Promise<number>;
  /** orderBy weekStart desc, take 4 (frozen golden). */
  weeklyHoursSamples(userId: number): Promise<WeeklyHoursSample[]>;
  /** orderBy date asc (frozen golden). */
  dailyLogDates(userId: number): Promise<Date[]>;
}
