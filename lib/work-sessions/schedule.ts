/**
 * DEPRECATED PATH — compatibility re-export (DEC-03, AC-00-12).
 *
 * The scheduled-pause rules moved to `backend/domain/work/schedule.ts` in OND0-B5 (SPEC §4.4:
 * a pure domain helper was living in `lib/`). This file stays so that every existing importer
 * — `components/ui/floating-session-timer.tsx`, `components/ui/session-auto-pause-countdown.tsx`,
 * `backend/modules/work-execution/infrastructure/work-session-service.gateway.ts` and the
 * dynamic `await import()` inside `backend/repositories/WorkSessionRepository.ts` — keeps
 * working unchanged (AC-00-14).
 *
 * New code imports `@/backend/domain/work` (or `@/backend/domain`). This path is removed in
 * OND9-B1 together with the last importer.
 */
export {
  getLastElapsedScheduledPause,
  getMinutesUntilNextPause,
  getMissedScheduledPause,
  getNextScheduledPause,
  MAX_STRETCH_SEC,
  SCHEDULED_PAUSE_TIMES,
  SESSION_TIMEZONE,
  toSafeDate,
} from "@/backend/domain/work/schedule";
