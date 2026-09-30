import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import { attachAssignees } from "@/backend/modules/task-management/application/use-cases/internal/task-view";

/**
 * GetTaskByIdUseCase — OND4-B3 (R2): rule moved from TaskServiceGateway.getTaskById.
 * Frozen: the read attaches task_assignees (assignedTo becomes the FIRST assignee).
 */
export interface GetTaskByIdDependencies {
  tasks: TaskRepositoryPort
  assignees: TaskAssigneesPort
}

export class GetTaskByIdUseCase {
  constructor(private readonly dependencies: GetTaskByIdDependencies) {}

  async execute(taskId: number) {
    const task = await this.dependencies.tasks.findById(taskId)
    if (!task) return null
    return await attachAssignees(task, this.dependencies.assignees)
  }
}
