import type { DailyLog } from "@/backend/domain"
import type { DailyLogRepositoryPort } from "@/backend/modules/work-execution/application/ports/daily-log.repository"

/**
 * GetDailyLogByIdUseCase — OND3-B2 (R2). Plain passthrough (frozen by golden).
 */
export interface GetDailyLogByIdDependencies {
  dailyLogs: DailyLogRepositoryPort
}

export class GetDailyLogByIdUseCase {
  constructor(private readonly dependencies: GetDailyLogByIdDependencies) {}

  async execute(logId: number): Promise<DailyLog | null> {
    return await this.dependencies.dailyLogs.findById(logId)
  }
}
