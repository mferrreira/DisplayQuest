import type { ITask } from "@/backend/models/Task"

export interface ListTasksForActorQuery {
  actorId: number
  actorRoles: string[]
  projectId?: number
}

export type CreateTaskCommand = Omit<ITask, "id">

export interface UpdateTaskCommand {
  taskId: number
  actorId: number
  data: Record<string, unknown>
}

export interface DeleteTaskCommand {
  taskId: number
  actorId: number
}

export interface CompleteTaskCommand {
  taskId: number
  userId: number
}

export interface ApproveTaskCommand {
  taskId: number
  approverId: number
}

export interface RejectTaskCommand {
  taskId: number
  approverId: number
  reason?: string
}
