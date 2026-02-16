import type {
  ApproveTaskCommand,
  CompleteTaskCommand,
  CreateTaskCommand,
  DeleteTaskCommand,
  ListTasksForActorQuery,
  RejectTaskCommand,
  UpdateTaskCommand,
} from "@/backend/modules/task-management/application/contracts"
import type { TaskManagementGateway } from "@/backend/modules/task-management/application/ports/task-management.gateway"
import { createTaskManagementGateway } from "@/backend/modules/task-management/infrastructure/task-service.gateway"

export class TaskManagementModule {
  constructor(private readonly gateway: TaskManagementGateway) {}

  async getTaskById(taskId: number) {
    return await this.gateway.getTaskById(taskId)
  }

  async listTasksForActor(query: ListTasksForActorQuery) {
    return await this.gateway.listTasksForActor(query)
  }

  async listActorProjectIds(actorId: number) {
    return await this.gateway.listActorProjectIds(actorId)
  }

  async createTask(command: CreateTaskCommand, actorId: number) {
    return await this.gateway.createTask(command, actorId)
  }

  async updateTask(command: UpdateTaskCommand) {
    return await this.gateway.updateTask(command)
  }

  async deleteTask(command: DeleteTaskCommand) {
    await this.gateway.deleteTask(command)
  }

  async completeTask(command: CompleteTaskCommand) {
    return await this.gateway.completeTask(command)
  }

  async approveTask(command: ApproveTaskCommand) {
    return await this.gateway.approveTask(command)
  }

  async rejectTask(command: RejectTaskCommand) {
    return await this.gateway.rejectTask(command)
  }
}

export function createTaskManagementModule() {
  return new TaskManagementModule(createTaskManagementGateway())
}
