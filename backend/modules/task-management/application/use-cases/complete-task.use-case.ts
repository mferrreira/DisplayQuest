import type { CompleteTaskCommand } from "@/backend/modules/task-management/application/contracts"
import type { TaskManagementGateway } from "@/backend/modules/task-management/application/ports/task-management.gateway"

export class CompleteTaskUseCase {
  constructor(private readonly gateway: TaskManagementGateway) {}

  async execute(command: CompleteTaskCommand) {
    return await this.gateway.completeTask(command)
  }
}
