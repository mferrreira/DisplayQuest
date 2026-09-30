import type { ListDailyLogsQuery } from "@/backend/modules/work-execution/application/contracts"
import type { DailyLogRepositoryPort } from "@/backend/modules/work-execution/application/ports/daily-log.repository"

/**
 * ListDailyLogsUseCase — OND3-B2 (R2). Dispatch frozen by golden:
 * userId+date -> findByDate (LOCAL day boundaries); userId -> findByUserId;
 * projectId -> findByProjectId; otherwise findAll.
 */
export interface ListDailyLogsDependencies {
  dailyLogs: DailyLogRepositoryPort
}

export class ListDailyLogsUseCase {
  constructor(private readonly dependencies: ListDailyLogsDependencies) {}

  async execute(query: ListDailyLogsQuery) {
    if (query.userId !== undefined) {
      if (query.date) {
        return await this.dependencies.dailyLogs.findByDate(query.userId, new Date(query.date))
      }
      return await this.dependencies.dailyLogs.findByUserId(query.userId)
    }

    if (query.projectId !== undefined) {
      return await this.dependencies.dailyLogs.findByProjectId(query.projectId)
    }

    return await this.dependencies.dailyLogs.findAll()
  }
}
