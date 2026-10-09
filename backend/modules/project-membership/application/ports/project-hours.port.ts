/**
 * ProjectHoursPort — OND5-B2 (R1). Completed-work-session aggregation for the member list:
 * SUM(duration) per user for a project, optionally restricted to a time window (the
 * Monday-based week window comes from domain/project/weekWindow).
 */
export interface ProjectHoursPort {
  sumCompletedSecondsByUser(
    projectId: number,
    window?: { start: Date; end: Date },
  ): Promise<Array<{ userId: number; seconds: number }>>
}
