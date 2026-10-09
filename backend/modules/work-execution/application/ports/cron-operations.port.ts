/**
 * CronOperationsPort (B6-1b, D4) — seam for the scheduled-jobs surface exposed by
 * `GET/POST /api/cron/status`.
 *
 * Before this port the route imported the `cronService` singleton from `lib/services`
 * directly: it was the only route of the 41 that decided authorization without a use case
 * underneath it, so there was nowhere for the rule to live but the route. The use cases
 * `GetCronStatusUseCase` / `ExecuteManualCronResetUseCase` own the rule now; this port is what
 * they need in order to do the work.
 *
 * The adapter lives in `infrastructure/cron-operations.adapter.ts` and is wired by the
 * factory's default, like every other port in this module.
 */
export interface CronStatus {
  isInitialized: boolean;
  weeklyResetRunning: boolean;
  weeklyResetNextRun: string;
  weeklyResetSchedule: string;
}

export interface CronOperationsPort {
  getStatus(): Promise<CronStatus>;
  executeManualReset(): Promise<void>;
}