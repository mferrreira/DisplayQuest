import { canReadDailyLog, ForbiddenError } from "@/backend/domain"
import type { DailyLog } from "@/backend/domain"
import type { ActorRef } from "@/backend/domain"
import type { DailyLogRepositoryPort } from "@/backend/modules/work-execution/application/ports/daily-log.repository"

/**
 * GetDailyLogByIdUseCase — OND3-B2 (R2). Plain passthrough (frozen by golden).
 *
 * B6-5 (D4): o gate do GET /api/daily_logs/[id] desceu mantendo a ordem medida — lookup
 * primeiro (ausente devolve null e a rota monta o 404 legado), depois a decisao:
 * LABORATORISTA le qualquer log; senao, self || MANAGE_USERS (403 "Acesso negado", o default
 * do ensureSelfOrPermission legado).
 */
export interface GetDailyLogByIdDependencies {
  dailyLogs: DailyLogRepositoryPort
}

export class GetDailyLogByIdUseCase {
  constructor(private readonly dependencies: GetDailyLogByIdDependencies) {}

  async execute(actor: ActorRef, logId: number): Promise<DailyLog | null> {
    const log = await this.dependencies.dailyLogs.findById(logId)
    if (!log) return null

    if (!canReadDailyLog(actor, log.userId)) {
      throw new ForbiddenError("Acesso negado")
    }

    return log
  }
}
