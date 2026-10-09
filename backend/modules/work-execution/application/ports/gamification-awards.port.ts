/**
 * GamificationAwardsPort (OND3-B2) — the seam that replaces the publisher's direct import of
 * `createGamificationModule` (allow-list entry `rg04-infrastructure-work-execution`).
 *
 * The publisher now depends on this port; the composition root wires the gamification module
 * into it (structural: awardFromWorkSession/awardFromTaskCompletion). No module imports
 * another module inside the boundary anymore (AC-00-11 for work-execution).
 */
export interface WorkSessionAwardArgs {
  userId: number;
  workSessionId: number;
  durationSeconds?: number | null;
  completedTaskIds?: number[];
}

export interface TaskCompletionAwardArgs {
  userId: number;
  taskId: number;
}

export interface GamificationAwardsPort {
  awardFromWorkSession(command: WorkSessionAwardArgs): Promise<unknown>;
  awardFromTaskCompletion(command: TaskCompletionAwardArgs): Promise<unknown>;
}
