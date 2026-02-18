import type { CreateDailyLogFromSessionCommand } from "@/backend/modules/work-execution/application/contracts"
import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"

export class CreateDailyLogFromSessionUseCase {
  constructor(private readonly gateway: WorkExecutionGateway) {}

  async execute(command: CreateDailyLogFromSessionCommand) {
    return await this.gateway.createDailyLogFromSession(command)
  }
}
