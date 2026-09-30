import type { WorkSession } from "@/backend/domain"
import type { WorkSessionRepositoryPort } from "@/backend/modules/work-execution/application/ports/work-session.repository"
import { normalizeExpiredActiveSessions } from "@/backend/modules/work-execution/application/use-cases/internal/normalize-expired-active-sessions"

/**
 * GetWorkSessionByIdUseCase — OND3-B2 (R2). Frozen by golden: missing -> null; an expired
 * ACTIVE session is auto-paused ON READ (the update is persisted, not just in-memory).
 */
export interface GetWorkSessionByIdDependencies {
  workSessions: WorkSessionRepositoryPort
}

export class GetWorkSessionByIdUseCase {
  constructor(private readonly dependencies: GetWorkSessionByIdDependencies) {}

  async execute(sessionId: number): Promise<WorkSession | null> {
    const session = await this.dependencies.workSessions.findById(sessionId)
    if (!session) return null

    const [normalized] = await normalizeExpiredActiveSessions(this.dependencies.workSessions, [session])
    return normalized
  }
}
