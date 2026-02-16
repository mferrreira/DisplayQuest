import type { TaskManagementGateway } from "@/backend/modules/task-management/application/ports/task-management.gateway"

export class GetTaskByIdUseCase {
  constructor(private readonly gateway: TaskManagementGateway) {}

  async execute(taskId: number) {
    return await this.gateway.getTaskById(taskId)
  }
}
