import { cronService } from "@/lib/services/cron-service"
import type { CronOperationsPort } from "@/backend/modules/work-execution/application/ports/cron-operations.port"

/**
 * CronOperationsPort adapter (B6-1b, D4) — the thin boundary between the work-execution use
 * cases and the scheduler singleton that still lives in `lib/services/cron-service.ts`.
 *
 * WHY THE LAZY ARROWS: `cron-service.ts` calls `getBackendComposition()` from inside its own
 * methods, and the composition root builds this module through this file — so the import graph
 * is a cycle (root → adapter → cron-service → root). Reading `cronService` inside the arrow
 * bodies means it is resolved at CALL time, by which point the module graph is fully evaluated.
 * Capturing it at module scope instead would read the binding while it is still initialising.
 */
export function createCronOperationsAdapter(): CronOperationsPort {
  return {
    getStatus: async () => cronService.getStatus(),
    executeManualReset: async () => {
      await cronService.executeManualReset()
    },
  }
}