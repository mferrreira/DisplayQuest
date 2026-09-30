import { NotFoundError } from "@/backend/domain";
import type { DeleteTaskCommand } from "@/backend/modules/task-management/application/contracts";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";

/**
 * DeleteTaskUseCase — OND4-B3 (R2).
 * FROZEN QUIRK (OND4-B1): the legacy deleteTask has NO permission check — any authenticated
 * actor deletes any task. Tightening it is a behavior change for a separate decision, not a
 * refactor; the contract suite pins the parity.
 */
export class DeleteTaskUseCase {
  constructor(private readonly tasks: TaskRepositoryPort) {}

  async execute(command: DeleteTaskCommand) {
    const task = await this.tasks.findById(command.taskId)
    if (!task) {
      throw new NotFoundError("Tarefa não encontrada")
    }
    await this.tasks.delete(command.taskId)
  }
}
