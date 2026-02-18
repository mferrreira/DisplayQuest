import type { RejectTaskCommand } from "@/backend/modules/task-management/application/contracts"
import type { TaskManagementGateway } from "@/backend/modules/task-management/application/ports/task-management.gateway"

export class RejectTaskUseCase {
  constructor(private readonly gateway: TaskManagementGateway) {}

  async execute(command: RejectTaskCommand) {
    return await this.gateway.rejectTask(command)
  }
}
