import { ForbiddenError, NotFoundError, requireActorPermission } from "@/backend/domain";
import type { DeleteTaskCommand } from "@/backend/modules/task-management/application/contracts";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import { requireTaskPersonActor } from "@/backend/modules/task-management/application/use-cases/internal/require-task-actor";

/**
 * DeleteTaskUseCase — OND4-B3 (R2).
 *
 * QUIRK superado (B6-7, DEC-123): a nota anterior dizia "the legacy deleteTask has NO
 * permission check — any authenticated actor deletes any task". Verdade no gateway legado,
 * mas a rota /api/tasks/[id] SEMPRE barrou com ensurePermission(MANAGE_TASKS, 'Sem permissão
 * para excluir tarefa') — o quirk so valia para chamadores diretos. Com D4 a decisao passa a
 * morar AQUI, com a mensagem congelada da rota e antes do lookup (ordem medida). Chamadores
 * diretos passam pela MESMA autoridade que a rota ja cobrava.
 */
export class DeleteTaskUseCase {
  constructor(private readonly tasks: TaskRepositoryPort) {}

  async execute(command: DeleteTaskCommand): Promise<void> {
    requireTaskPersonActor(command.actor)
    requireActorPermission(command.actor, "MANAGE_TASKS", "Sem permissão para excluir tarefa")

    const task = await this.tasks.findById(command.taskId)
    if (!task) {
      throw new NotFoundError("Tarefa não encontrada")
    }
    await this.tasks.delete(command.taskId)
  }
}
