import {
  ConflictError,
  NotFoundError,
  ValidationError,
  canEditSubtasksOf,
  canMarkSubtasksOf,
  createSubtaskRecord,
  shouldAutoMoveMotherToReview,
  statusOnlyPatch,
  subtaskMarkMessage,
  subtaskWindowMessage,
  supportsSubtasks,
} from "@/backend/domain";
import type { SubtaskMutationResult } from "@/backend/modules/task-management/application/contracts";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskNotificationsPort } from "@/backend/modules/task-management/application/ports/task-notifications.port";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import {
  assertCanOperateSubtasks,
  attachSubtasks,
  publishTaskReviewRequest,
} from "@/backend/modules/task-management/application/use-cases/internal/task-view";

/**
 * UpdateTaskSubtaskUseCase — plano-v4 · V4-4. Renomear e concluir.
 *
 * A distinção que o dono decidiu (DEC-80) e que este arquivo é o único lugar onde existe:
 *
 *   - mexer na **lista** (criar, renomear, apagar) para quando a mãe entra em `in-review` ou
 *     `done` — 409;
 *   - **marcar** (`completed: true`) exige a mãe em `in-progress` (DEC-98, 2026-10-07 — resposta
 *     do dono ao impasse com o auto-move): fora de lá é 409 com `subtaskMarkMessage`, a MESMA
 *     frase que o cliente mostra no toast. A janela de `done` continua vindo primeiro, para que
 *     `done` responda com a frase congelada da janela (DEC-80). **Desmarcar** não é marcar:
 *     continua livre em qualquer status que não `done`.
 *   - o auto-move (DEC-81) é o que devolve a mãe a `in-progress`→`in-review`; com a trava de
 *     DEC-97 no lugar, uma mãe em `in-review` com subtask aberta só nasce de dado legado.
 *
 * Auto-move (DEC-81): a última subtask concluída empurra a mãe de `in-progress` para
 * `in-review`, com a mesma notificação que um movimento humano teria. Auto-mover **não** é
 * concluir: ninguém é creditado e o contador de tarefas concluídas não mexe — o prêmio da mãe
 * continua sendo creditado na aprovação.
 */
export interface UpdateTaskSubtaskCommand {
  taskId: number
  subtaskId: number
  actorId: number
  title?: unknown
  completed?: boolean
}

export interface UpdateTaskSubtaskDependencies {
  tasks: TaskRepositoryPort
  subtasks: TaskSubtasksPort
  assignees: TaskAssigneesPort
  actors: TaskActorsPort
  projects: TaskProjectsPort
  notifications: TaskNotificationsPort
}

export class UpdateTaskSubtaskUseCase {
  constructor(private readonly dependencies: UpdateTaskSubtaskDependencies) {}

  async execute(command: UpdateTaskSubtaskCommand): Promise<SubtaskMutationResult> {
    const task = await this.dependencies.tasks.findById(command.taskId)
    if (!task) throw new NotFoundError("Tarefa não encontrada")

    const actor = await this.dependencies.actors.findById(command.actorId)
    if (!actor) throw new NotFoundError("Usuário não encontrado")

    const subtask = await this.dependencies.subtasks.findById(command.subtaskId)
    // Subtask de outra tarefa é 404, não 403: confirmar que ela existe em outro pai já é vazamento.
    if (!subtask || subtask.taskId !== task.id) throw new NotFoundError("Subtask não encontrada")

    await assertCanOperateSubtasks(task, command.actorId, actor.roles, {
      assignees: this.dependencies.assignees,
      actors: this.dependencies.actors,
      projects: this.dependencies.projects,
    })

    if (!supportsSubtasks(task.taskVisibility, Boolean(task.isGlobal))) {
      throw new ValidationError("Subtask só existe em tarefa delegada ou privada")
    }

    let nextTitle: string | undefined;
    if (command.title !== undefined) {
      if (!canEditSubtasksOf(task.status)) throw new ConflictError(subtaskWindowMessage(task.status));
      nextTitle = createSubtaskRecord({ title: command.title }).title;
    }

    if (command.completed !== undefined && task.status === "done") {
      throw new ConflictError(subtaskWindowMessage(task.status));
    }

    // DEC-98: marcar exige a mãe em Andamento. A frase é a do domínio — o toast do cliente
    // mostra exatamente o que a rota recusou.
    if (command.completed === true && !canMarkSubtasksOf(task.status)) {
      throw new ConflictError(subtaskMarkMessage());
    }

    const updated = await this.dependencies.subtasks.update(command.subtaskId, {
      ...(nextTitle !== undefined ? { title: nextTitle } : {}),
      ...(command.completed !== undefined
        ? { completed: command.completed, completedAt: command.completed ? new Date() : null }
        : {}),
    });

    const all = await this.dependencies.subtasks.listByTaskId(task.id!);
    let mother = task;

    if (command.completed === true && shouldAutoMoveMotherToReview(task.status, all)) {
      // `statusOnlyPatch` é o mesmo patch de uma pessoa arrastando a mãe para Em Revisão
      // (branch status-only do UpdateTaskUseCase) — o auto-move não inventa um terceiro jeito.
      mother = await this.dependencies.tasks.update(task.id!, {
        ...task,
        ...statusOnlyPatch("in-review", new Date()),
      });

      if (task.projectId) {
        const project = await this.dependencies.projects.findById(task.projectId);
        if (project?.leaderId) {
          await publishTaskReviewRequest(this.dependencies.notifications, this.dependencies.actors, {
            taskId: task.id!,
            taskTitle: task.title,
            userId: command.actorId,
            projectLeaderId: project.leaderId,
          });
        }
      }
    }

    return { subtask: updated, task: await attachSubtasks(mother, this.dependencies.subtasks) };
  }
}
