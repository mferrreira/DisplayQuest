import type { CreateTaskCommand } from "@/backend/modules/task-management/application/contracts"
import type { TaskManagementGateway } from "@/backend/modules/task-management/application/ports/task-management.gateway"

export class CreateTaskUseCase {
  constructor(private readonly gateway: TaskManagementGateway) {}

  async execute(command: CreateTaskCommand, actorId: number) {
    return await this.gateway.createTask(command, actorId)
  }
}
