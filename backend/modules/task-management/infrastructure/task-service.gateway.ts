import { TaskRepository } from "@/backend/repositories/TaskRepository"
import { UserRepository } from "@/backend/repositories/UserRepository"
import { ProjectRepository } from "@/backend/repositories/ProjectRepository"
import { TaskService } from "@/backend/services/TaskService"
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

export class TaskServiceGateway implements TaskManagementGateway {
  constructor(private readonly taskService: TaskService) {}

  async getTaskById(taskId: number) {
    return await this.taskService.findById(taskId)
  }

  async listTasksForActor(query: ListTasksForActorQuery) {
    if (query.projectId) {
      return (await this.taskService.getTasksForUser(query.actorId, query.actorRoles))
        .filter((task) => task.projectId === query.projectId)
    }

    const userTasks = await this.taskService.getTasksForUser(query.actorId, query.actorRoles)
    const globalTasks = await this.taskService.getGlobalTasks()
    return [...userTasks, ...globalTasks]
  }

  async listActorProjectIds(actorId: number) {
    const projects = await this.taskService.getProjectsForUser(actorId)
    return projects.map((project) => project.id)
  }

  async createTask(command: CreateTaskCommand, actorId: number) {
    return await this.taskService.create(command, actorId)
  }

  async updateTask(command: UpdateTaskCommand) {
    return await this.taskService.update(command.taskId, command.data, command.actorId)
  }

  async deleteTask(command: DeleteTaskCommand) {
    await this.taskService.delete(command.taskId, command.actorId)
  }

  async completeTask(command: CompleteTaskCommand) {
    return await this.taskService.completeTask(command.taskId, command.userId)
  }

  async approveTask(command: ApproveTaskCommand) {
    return await this.taskService.approveTask(command.taskId, command.approverId)
  }

  async rejectTask(command: RejectTaskCommand) {
    return await this.taskService.rejectTask(command.taskId, command.approverId, command.reason)
  }
}

export function createTaskManagementGateway() {
  return new TaskServiceGateway(
    new TaskService(
      new TaskRepository(),
      new UserRepository(),
      new ProjectRepository(),
    ),
  )
}
