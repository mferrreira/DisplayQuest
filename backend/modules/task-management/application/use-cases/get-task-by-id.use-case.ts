import { ForbiddenError, hasPermission } from "@/backend/domain";
import type { ActorRef } from "@/backend/domain";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import { attachAssignees, attachSubtasks } from "@/backend/modules/task-management/application/use-cases/internal/task-view";
import { requireTaskPersonActor } from "@/backend/modules/task-management/application/use-cases/internal/require-task-actor";

/**
 * GetTaskByIdUseCase — OND4-B3 (R2): rule moved from TaskServiceGateway.getTaskById.
 * Frozen: the read attaches task_assignees (assignedTo becomes the FIRST assignee).
 * plan-v4 · V4-4: attaches the subtasks too (DEC-79) — o diálogo de detalhe precisa delas para
 * mostrar a trava e o valor real da tarefa.
 *
 * B6-7 (D4): a RESOLUCAO DE ESCOPO do GET /api/tasks/[id] desceu da rota para ca, na ordem
 * medida (lookup -> null devolvido, porque o 404 e legado montado pela rota -> decisao):
 * MANAGE_USERS ve tudo; o DONO (assignedTo ou assigneeIds) ve a sua; terceiro so ve tarefa de
 * projeto em que e membro — fora disso, ForbiddenError('Acesso negado', medido sem ponto).
 * Tarefa sem projeto nao e barrada por membership (o `task.projectId &&` da rota legado).
 */
export interface GetTaskByIdDependencies {
  tasks: TaskRepositoryPort
  assignees: TaskAssigneesPort
  subtasks: TaskSubtasksPort
  actors: TaskActorsPort
}

export class GetTaskByIdUseCase {
  constructor(private readonly dependencies: GetTaskByIdDependencies) {}

  async execute(command: { actor: ActorRef; taskId: number }) {
    const person = requireTaskPersonActor(command.actor)

    const task = await this.dependencies.tasks.findById(command.taskId)
    if (!task) return null
    const withAssignees = await attachAssignees(task, this.dependencies.assignees)
    const withSubtasks = await attachSubtasks(withAssignees, this.dependencies.subtasks)

    if (hasPermission(person.roles, "MANAGE_USERS")) return withSubtasks

    const isOwner = withSubtasks.assignedTo === person.id || Boolean(withSubtasks.assigneeIds?.includes(person.id))
    if (isOwner) return withSubtasks

    if (withSubtasks.projectId) {
      const memberships = await this.dependencies.actors.getUserProjectMemberships(person.id)
      if (!memberships.some((membership) => membership.projectId === withSubtasks.projectId)) {
        throw new ForbiddenError("Acesso negado")
      }
    }

    return withSubtasks
  }
}
