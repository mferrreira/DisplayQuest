import { NotFoundError } from "@/backend/domain"
import type { DeleteWorkSessionCommand } from "@/backend/modules/work-execution/application/contracts"
import type { WorkSessionRepositoryPort } from "@/backend/modules/work-execution/application/ports/work-session.repository"
import { requireSessionActor } from "@/backend/modules/work-execution/application/use-cases/internal/require-session-actor"

/**
 * DeleteWorkSessionUseCase — OND3-B2 (R2). Owner or MANAGE_WORK_SESSIONS; frozen messages.
 * B6-5 (D4): a rota DELETE montava o MESMO gate com a mensagem default ("Acesso negado");
 * o gate redundante saiu da rota e a mensagem do use case virou fonte unica (ordem medida:
 * lookup 404 antes do 403).
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

    requireSessionActor(command.actor, session.userId, "Não autorizado a excluir esta sessão")

    await this.dependencies.workSessions.delete(command.sessionId)
  }
}
