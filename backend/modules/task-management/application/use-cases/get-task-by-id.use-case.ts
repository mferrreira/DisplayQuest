import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import { attachAssignees, attachSubtasks } from "@/backend/modules/task-management/application/use-cases/internal/task-view";

/**
 * GetTaskByIdUseCase — OND4-B3 (R2): rule moved from TaskServiceGateway.getTaskById.
 * Frozen: the read attaches task_assignees (assignedTo becomes the FIRST assignee).
 * plan-v4 · V4-4: attaches the subtasks too (DEC-79) — o diálogo de detalhe precisa delas para
 * mostrar a trava e o valor real da tarefa.
 */
export interface GetTaskByIdDependencies {
  tasks: TaskRepositoryPort
  assignees: TaskAssigneesPort
  subtasks: TaskSubtasksPort
}

export class GetTaskByIdUseCase {
  constructor(private readonly dependencies: GetTaskByIdDependencies) {}

  async execute(taskId: number) {
    const task = await this.dependencies.tasks.findById(taskId)
    if (!task) return null
    const withAssignees = await attachAssignees(task, this.dependencies.assignees)
    return await attachSubtasks(withAssignees, this.dependencies.subtasks)
  }
}
