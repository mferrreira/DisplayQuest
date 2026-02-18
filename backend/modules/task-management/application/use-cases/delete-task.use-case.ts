import type { DeleteTaskCommand } from "@/backend/modules/task-management/application/contracts"
import type { TaskManagementGateway } from "@/backend/modules/task-management/application/ports/task-management.gateway"

export class DeleteTaskUseCase {
  constructor(private readonly gateway: TaskManagementGateway) {}

  async execute(command: DeleteTaskCommand) {
    await this.gateway.deleteTask(command)
  }
}
