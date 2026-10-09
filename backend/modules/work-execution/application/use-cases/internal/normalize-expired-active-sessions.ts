import { expiredPausePatch, type WorkSession } from "@/backend/domain"
import type { WorkSessionRepositoryPort } from "@/backend/modules/work-execution/application/ports/work-session.repository"

/**
 * Scheduled auto-pause normalization (OND3-B2): an ACTIVE session that crossed a scheduled
 * pause time (09:30 / 12:00 / 15:00 / 17:00 America/Sao_Paulo) is paused AT that instant —
 * not at the moment of this (possibly lazy) read — with its stretch frozen into duration
 * (capped at MAX_STRETCH_SEC). Frozen by the golden matrix (OND3-B1): list/getById run this
 * BEFORE returning, and status filters apply AFTER it.
 */
export async function normalizeExpiredActiveSessions(
  workSessions: WorkSessionRepositoryPort,
  sessions: WorkSession[],
  now: Date = new Date(),
): Promise<WorkSession[]> {
  return await Promise.all(
    sessions.map(async (session) => {
      if (!session.id) return session

      const patch = expiredPausePatch(session, now)
      if (!patch) return session

      return await workSessions.update(session.id, patch)
    }),
  )
}
