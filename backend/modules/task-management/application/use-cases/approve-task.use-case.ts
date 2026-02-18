import type { ApproveTaskCommand } from "@/backend/modules/task-management/application/contracts"
import type { TaskManagementGateway } from "@/backend/modules/task-management/application/ports/task-management.gateway"

export class ApproveTaskUseCase {
  constructor(private readonly gateway: TaskManagementGateway) {}

  async execute(command: ApproveTaskCommand) {
    return await this.gateway.approveTask(command)
  }
}
