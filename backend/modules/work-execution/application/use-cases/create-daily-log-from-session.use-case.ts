import { ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain"
import type { CreateDailyLogFromSessionCommand } from "@/backend/modules/work-execution/application/contracts"
import type { DailyLogRepositoryPort } from "@/backend/modules/work-execution/application/ports/daily-log.repository"
import type { WorkSessionRepositoryPort } from "@/backend/modules/work-execution/application/ports/work-session.repository"

/**
 * CreateDailyLogFromSessionUseCase — OND3-B2 (R2): rules moved from WorkSessionServiceGateway.
 * Frozen by golden: OWNER-ONLY (no MANAGE_WORK_SESSIONS bypass), completed-only, user must
 * exist; date defaults to today's ISO date, note defaults to null.
 */
export interface CreateDailyLogFromSessionDependencies {
  workSessions: WorkSessionRepositoryPort
  dailyLogs: DailyLogRepositoryPort
}

export class CreateDailyLogFromSessionUseCase {
  constructor(private readonly dependencies: CreateDailyLogFromSessionDependencies) {}

  async execute(command: CreateDailyLogFromSessionCommand) {
    const session = await this.dependencies.workSessions.findById(command.sessionId)
    if (!session) {
      throw new NotFoundError("Sessão não encontrada")
    }

    if (session.userId !== command.actorUserId) {
      throw new ForbiddenError("Não autorizado a registrar log desta sessão")
    }

    if (session.status !== "completed") {
      throw new ValidationError("A sessão precisa estar finalizada para gerar log")
    }

    const logDate = command.date || new Date().toISOString().split("T")[0]

    const user = await this.dependencies.dailyLogs.findUserById(session.userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    return await this.dependencies.dailyLogs.create({
      userId: session.userId,
      projectId: session.projectId || null,
      date: new Date(logDate),
      note: command.note || null,
      workSessionId: session.id,
    })
  }
}
