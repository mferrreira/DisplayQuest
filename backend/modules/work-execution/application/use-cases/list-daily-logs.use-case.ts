import type { ListDailyLogsQuery } from "@/backend/modules/work-execution/application/contracts"
import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"

export class ListDailyLogsUseCase {
  constructor(private readonly gateway: WorkExecutionGateway) {}

  async execute(query: ListDailyLogsQuery) {
    return await this.gateway.listDailyLogs(query)
  }
}
