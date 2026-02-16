import type { ListWorkSessionsQuery } from "@/backend/modules/work-execution/application/contracts"
import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"

export class ListWorkSessionsUseCase {
  constructor(private readonly gateway: WorkExecutionGateway) {}

  async execute(query: ListWorkSessionsQuery) {
    return await this.gateway.listWorkSessions(query)
  }
}
