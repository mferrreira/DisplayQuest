import type { Task } from "@/backend/models/Task"
import type {
  ApproveTaskCommand,
  CompleteTaskCommand,
  CreateTaskCommand,
  DeleteTaskCommand,
  RejectTaskCommand,
  UpdateTaskCommand,
} from "@/backend/modules/task-management/application/contracts"

export interface TaskManagementGateway {
  getTaskById(taskId: number): Promise<Task | null>
  listTasksForUser(actorId: number, actorRoles: string[]): Promise<Task[]>
  listGlobalTasks(): Promise<Task[]>
  applyActorProgress(tasks: Task[], actorId: number): Promise<Task[]>
  listActorProjectIds(actorId: number): Promise<number[]>
  createTask(command: CreateTaskCommand, actorId: number): Promise<Task>
  createTaskBacklog(tasks: CreateTaskCommand[], actorId: number): Promise<Task[]>
  updateTask(command: UpdateTaskCommand): Promise<Task>
  deleteTask(command: DeleteTaskCommand): Promise<void>
  completeTask(command: CompleteTaskCommand): Promise<Task>
  approveTask(command: ApproveTaskCommand): Promise<Task>
  rejectTask(command: RejectTaskCommand): Promise<Task>
}
