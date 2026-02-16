import type { StartWorkSessionCommand } from "@/backend/modules/work-execution/application/contracts"
import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"

export class StartWorkSessionUseCase {
  constructor(private readonly gateway: WorkExecutionGateway) {}

  async execute(command: StartWorkSessionCommand) {
    return await this.gateway.startWorkSession(command)
  }
}
