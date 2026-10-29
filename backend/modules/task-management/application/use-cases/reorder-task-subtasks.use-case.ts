import {
  ConflictError,
  NotFoundError,
  ValidationError,
  canEditSubtasksOf,
  subtaskWindowMessage,
  supportsSubtasks,
} from "@/backend/domain";
import type { ReorderSubtasksResult } from "@/backend/modules/task-management/application/contracts";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import { assertCanOperateSubtasks, attachSubtasks } from "@/backend/modules/task-management/application/use-cases/internal/task-view";

/**
 * ReorderTaskSubtasksUseCase — S09 (plan-v11, R9).
 *
 * Ordem medida, a mesma dos irmãos de V4-4: **ator → existência da mãe → autoridade →
 * visibilidade → janela → ids válidos → escrita**. Autoridade antes de estado (403-antes-de-409,
 * B6-2b), e a janela da lista (DEC-80) governa arrastar também: reordenar é mexer na lista, e
 * a lista só é mexível enquanto a mãe não está em Em Revisão/Concluído.
 *
 * Reordenar não escreve prêmio, não move a mãe, não notifica: é só ordem.
 */
export interface ReorderTaskSubtasksCommand {
  taskId: number
  actorId: number
  orderedIds?: unknown
}

export interface ReorderTaskSubtasksDependencies {
  tasks: TaskRepositoryPort
  subtasks: TaskSubtasksPort
  assignees: TaskAssigneesPort
  actors: TaskActorsPort
  projects: TaskProjectsPort
}

export class ReorderTaskSubtasksUseCase {
  constructor(private readonly dependencies: ReorderTaskSubtasksDependencies) {}

  async execute(command: ReorderTaskSubtasksCommand): Promise<ReorderSubtasksResult> {
    const task = await this.dependencies.tasks.findById(command.taskId)
    if (!task) throw new NotFoundError("Tarefa não encontrada")

    const actor = await this.dependencies.actors.findById(command.actorId)
    if (!actor) throw new NotFoundError("Usuário não encontrado")

    await assertCanOperateSubtasks(task, command.actorId, actor.roles, {
      assignees: this.dependencies.assignees,
      projects: this.dependencies.projects,
    })

    if (!supportsSubtasks(task.taskVisibility, Boolean(task.isGlobal))) {
      throw new ValidationError("Subtask só existe em tarefa delegada ou privada")
    }

    if (!canEditSubtasksOf(task.status)) {
      throw new ConflictError(subtaskWindowMessage(task.status))
    }

    const current = await this.dependencies.subtasks.listByTaskId(task.id!)
    const currentIds = current.map((s) => s.id).filter((id): id is number => id !== undefined)
    const orderedIds = this.assertPermutation(command.orderedIds, currentIds)

    const list = await this.dependencies.subtasks.reorder(task.id!, orderedIds)
    const mother = await attachSubtasks(task, this.dependencies.subtasks)
    return { task: mother, subtasks: list }
  }

  /** Os ids têm de ser exatamente a lista da mãe — sem repetido, sem estranho, sem faltante. */
  private assertPermutation(orderedIds: unknown, currentIds: number[]): number[] {
    if (!Array.isArray(orderedIds)) {
      throw new ValidationError("A ordem deve conter exatamente as subtasks da tarefa")
    }
    const ids = orderedIds.map((id) => Number(id))
    const valid =
      ids.length === currentIds.length &&
      ids.every((id) => Number.isInteger(id)) &&
      new Set(ids).size === ids.length &&
      ids.every((id) => currentIds.includes(id))
    if (!valid) {
      throw new ValidationError("A ordem deve conter exatamente as subtasks da tarefa")
    }
    return ids
  }
}
