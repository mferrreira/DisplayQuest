import type { DeleteWorkSessionCommand } from "@/backend/modules/work-execution/application/contracts"
import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"

export class DeleteWorkSessionUseCase {
  constructor(private readonly gateway: WorkExecutionGateway) {}

  async execute(command: DeleteWorkSessionCommand) {
    return await this.gateway.deleteWorkSession(command)
  }
}
