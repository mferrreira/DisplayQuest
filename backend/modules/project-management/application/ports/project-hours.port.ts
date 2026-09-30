/**
 * ProjectHoursPort — OND5-B2 (R1). Completed-session duration aggregation for the
 * volunteer stats (the legacy gateway ran two prisma.work_sessions.findMany per member;
 * the port narrows that to the observable SUM).
 */
export interface ProjectHoursPort {
  sumCompletedSeconds(
    userId: number,
    projectId: number,
    window?: { start: Date; end: Date },
  ): Promise<number>
}
