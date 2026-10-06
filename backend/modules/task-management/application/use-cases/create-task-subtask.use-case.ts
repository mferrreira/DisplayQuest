import {
  ConflictError,
  NotFoundError,
  ValidationError,
  canEditSubtasksOf,
  createSubtaskRecord,
  subtaskWindowMessage,
  supportsSubtasks,
} from "@/backend/domain";
import type { SubtaskMutationResult } from "@/backend/modules/task-management/application/contracts";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import {
  assertCanOperateSubtasks,
  attachSubtasks,
  syncMotherBasePoints,
} from "@/backend/modules/task-management/application/use-cases/internal/task-view";

/**
 * CreateTaskSubtaskUseCase — plano-v4 · V4-4.
 *
 * Ordem medida e fixada em teste: **ator → existência da mãe → autoridade → visibilidade →
 * janela → título**. Autoridade antes de qualquer recusa de estado, porque uma recusa de estado
 * revelaria a quem não tem acesso que a tarefa existe e em que coluna está (a mesma precedência
 * 403-antes-de-409 fixada no B6-2b).
 */
export interface CreateTaskSubtaskCommand {
  taskId: number
  actorId: number
  title?: unknown
}

export interface CreateTaskSubtaskDependencies {
  tasks: TaskRepositoryPort
  subtasks: TaskSubtasksPort
  assignees: TaskAssigneesPort
  actors: TaskActorsPort
  projects: TaskProjectsPort
}

export class CreateTaskSubtaskUseCase {
  constructor(private readonly dependencies: CreateTaskSubtaskDependencies) {}

  async execute(command: CreateTaskSubtaskCommand): Promise<SubtaskMutationResult> {
    const task = await this.dependencies.tasks.findById(command.taskId)
    if (!task) throw new NotFoundError("Tarefa não encontrada")

    const actor = await this.dependencies.actors.findById(command.actorId)
    if (!actor) throw new NotFoundError("Usuário não encontrado")

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

    const record = createSubtaskRecord({ title: command.title })
    const created = await this.dependencies.subtasks.create(task.id!, record.title)

    const all = await this.dependencies.subtasks.listByTaskId(task.id!)
    const mother = await syncMotherBasePoints(task, all.length, this.dependencies.tasks)

    return { subtask: created, task: await attachSubtasks(mother, this.dependencies.subtasks) };
  }
}
