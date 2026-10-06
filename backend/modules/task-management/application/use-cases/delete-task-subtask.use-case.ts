import { ConflictError, NotFoundError, ValidationError, canEditSubtasksOf, supportsSubtasks } from "@/backend/domain";
import type { SubtaskMutationResult } from "@/backend/modules/task-management/application/contracts";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import {
  assertCanOperateSubtasks,
  attachSubtasks,
  subtaskWindowMessage,
  syncMotherBasePoints,
} from "@/backend/modules/task-management/application/use-cases/internal/task-view";

/**
 * DeleteTaskSubtaskUseCase — plano-v4 · V4-4.
 *
 * Apagar é mexer na lista, então obedece à janela (DEC-80): mãe em `in-review` ou `done` recusa.
 * Apagar também derruba a base da mãe (10 + 10·n com o `n` que sobrou) — e isso só alcança
 * tarefa que ainda não foi aprovada, porque a janela fecha a lista antes.
 */
export interface DeleteTaskSubtaskCommand {
  taskId: number
  subtaskId: number
  actorId: number
}

export interface DeleteTaskSubtaskDependencies {
  tasks: TaskRepositoryPort
  subtasks: TaskSubtasksPort
  assignees: TaskAssigneesPort
  actors: TaskActorsPort
  projects: TaskProjectsPort
}

export class DeleteTaskSubtaskUseCase {
  constructor(private readonly dependencies: DeleteTaskSubtaskDependencies) {}

  async execute(command: DeleteTaskSubtaskCommand): Promise<SubtaskMutationResult> {
    const task = await this.dependencies.tasks.findById(command.taskId)
    if (!task) throw new NotFoundError("Tarefa não encontrada")

    const actor = await this.dependencies.actors.findById(command.actorId)
    if (!actor) throw new NotFoundError("Usuário não encontrado")

    const subtask = await this.dependencies.subtasks.findById(command.subtaskId)
    if (!subtask || subtask.taskId !== task.id) throw new NotFoundError("Subtask não encontrada")

    await assertCanOperateSubtasks(task, command.actorId, actor.roles, {
      assignees: this.dependencies.assignees,
      actors: this.dependencies.actors,
      projects: this.dependencies.projects,
    })

    if (!supportsSubtasks(task.taskVisibility, Boolean(task.isGlobal))) {
      throw new ValidationError("Subtask só existe em tarefa delegada ou privada")
    }
    if (!canEditSubtasksOf(task.status)) {
      throw new ConflictError(subtaskWindowMessage(task.status))
    }

    await this.dependencies.subtasks.delete(command.subtaskId);

    const all = await this.dependencies.subtasks.listByTaskId(task.id!);
    const mother = await syncMotherBasePoints(task, all.length, this.dependencies.tasks);

    return { subtask, task: await attachSubtasks(mother, this.dependencies.subtasks) };
  }
}
