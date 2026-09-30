import { canActOnSession, ForbiddenError, NotFoundError } from "@/backend/domain"
import type { DeleteWorkSessionCommand } from "@/backend/modules/work-execution/application/contracts"
import type { WorkSessionRepositoryPort } from "@/backend/modules/work-execution/application/ports/work-session.repository"

/**
 * DeleteWorkSessionUseCase — OND3-B2 (R2). Owner or MANAGE_WORK_SESSIONS; frozen messages.
 */
export interface DeleteWorkSessionDependencies {
  workSessions: WorkSessionRepositoryPort
}

export class DeleteWorkSessionUseCase {
  constructor(private readonly dependencies: DeleteWorkSessionDependencies) {}

  async execute(command: DeleteWorkSessionCommand) {
    const session = await this.dependencies.workSessions.findById(command.sessionId)
    if (!session) {
      throw new NotFoundError("Sessão não encontrada")
    }

    if (!canActOnSession(command.actorUserId, command.actorRoles, session.userId)) {
      throw new ForbiddenError("Não autorizado a excluir esta sessão")
    }

    await this.dependencies.workSessions.delete(command.sessionId)
  }
}
