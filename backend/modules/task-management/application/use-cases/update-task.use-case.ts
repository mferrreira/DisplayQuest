import type { UpdateTaskCommand } from "@/backend/modules/task-management/application/contracts"
import type { TaskManagementGateway } from "@/backend/modules/task-management/application/ports/task-management.gateway"

export class UpdateTaskUseCase {
  constructor(private readonly gateway: TaskManagementGateway) {}

  async execute(command: UpdateTaskCommand) {
    return await this.gateway.updateTask(command)
  }
}
