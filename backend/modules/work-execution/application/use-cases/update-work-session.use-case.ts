import type { UpdateWorkSessionCommand } from "@/backend/modules/work-execution/application/contracts"
import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"

export class UpdateWorkSessionUseCase {
  constructor(private readonly gateway: WorkExecutionGateway) {}

  async execute(command: UpdateWorkSessionCommand) {
    return await this.gateway.updateWorkSession(command)
  }
}
