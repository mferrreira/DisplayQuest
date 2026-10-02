import type { ITask } from "@/backend/domain"

export interface ListTasksForActorQuery {
  actorId: number
  actorRoles: string[]
  projectId?: number
}

export type CreateTaskCommand = Omit<ITask, "id" | "points"> & {
  // plan-v3 DEC-30: caller no longer defines the award. Kept only for internal/backlog callers
  // that still carry the historical value; when absent, createTaskRecord applies POINTS_PER_TASK.
  points?: number
  creationMode?: "individual" | "shared"
}

export interface CreateTaskBacklogCommand {
  tasks: CreateTaskCommand[]
}

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
