import { ValidationError } from "@/backend/domain"
import type { ListWorkSessionsQuery } from "@/backend/modules/work-execution/application/contracts"
import { normalizeExpiredActiveSessions } from "@/backend/modules/work-execution/application/use-cases/internal/normalize-expired-active-sessions"
import type { WorkSessionRepositoryPort } from "@/backend/modules/work-execution/application/ports/work-session.repository"

/**
 * ListWorkSessionsUseCase — OND3-B2 (R2). Frozen by golden: userId+status together is an
 * invalid query; expired active sessions are normalized to paused BEFORE filtering, so
 * status="active" EXCLUDES them.
 */
export interface ListWorkSessionsDependencies {
  workSessions: WorkSessionRepositoryPort
}

export class ListWorkSessionsUseCase {
  constructor(private readonly dependencies: ListWorkSessionsDependencies) {}

  async execute(query: ListWorkSessionsQuery) {
    if (query.userId !== undefined && query.status !== undefined) {
      throw new ValidationError("Consulta de sessões inválida")
    }

    if (query.userId !== undefined) {
      const sessions = await this.dependencies.workSessions.findByUserId(query.userId)
      return await normalizeExpiredActiveSessions(this.dependencies.workSessions, sessions)
    }

    if (query.status !== undefined) {
      const sessions = await this.dependencies.workSessions.findByStatus(query.status)
      const normalizedSessions = await normalizeExpiredActiveSessions(this.dependencies.workSessions, sessions)
      return normalizedSessions.filter((session) => session.status === query.status)
    }

    const sessions = await this.dependencies.workSessions.findAll()
    return await normalizeExpiredActiveSessions(this.dependencies.workSessions, sessions)
  }
}
