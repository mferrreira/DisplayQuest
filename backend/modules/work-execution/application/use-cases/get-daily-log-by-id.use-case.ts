import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"

export class GetDailyLogByIdUseCase {
  constructor(private readonly gateway: WorkExecutionGateway) {}

  async execute(logId: number) {
    return await this.gateway.getDailyLogById(logId)
  }
}
