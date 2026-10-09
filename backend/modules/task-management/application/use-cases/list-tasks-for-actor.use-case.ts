import { canListAllTasks, dedupeTasksById, hasPermission, type Task } from "@/backend/domain";
import { requireTaskPersonActor } from "@/backend/modules/task-management/application/use-cases/internal/require-task-actor";
import type { ListTasksForActorQuery } from "@/backend/modules/task-management/application/contracts";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository";
import type { TaskSubtasksPort } from "@/backend/modules/task-management/application/ports/task-subtasks.repository";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import { applyActorProgressToTasks, batchAttachSubtasks } from "@/backend/modules/task-management/application/use-cases/internal/task-view";

/**
 * ListTasksForActorUseCase — OND4-B3 (R2): visibility rules moved from the gateway.
 * Frozen (OND4-B1):
 *   - COORDENADOR/GERENTE/COLABORADOR see findAll (id DESC) WITHOUT assignee attachment;
 *   - everyone else sees the deduped union assigned -> task_assignees -> project membership;
 *   - global/public-without-project tasks are appended (listGlobalTasks semantics);
 *   - projectId query additionally includes PUBLIC tasks of that project;
 *   - the result is overlaid with the actor's own task_user_progress (public tasks).
 *
 * plan-v4 · V4-4: as subtasks são anexadas em lote (uma consulta, não N+1) — o cartão do quadro
 * precisa delas para mostrar a trava e o valor real da tarefa (DEC-79).
 */
export interface ListTasksForActorDependencies {
  tasks: TaskRepositoryPort
  assignees: TaskAssigneesPort
  progress: TaskProgressPort
  actors: TaskActorsPort
  subtasks: TaskSubtasksPort
}

export class ListTasksForActorUseCase {
  constructor(private readonly dependencies: ListTasksForActorDependencies) {}

  async execute(query: ListTasksForActorQuery) {
    const person = requireTaskPersonActor(query.actor)
    const actorId = person.id
    const actorRoles = person.roles

    // B6-7 (D4): a checagem de projeto da rota GET desceu para ca, preservando o quirk
    // medido: quem nao tem MANAGE_USERS e pede um projeto do qual NAO e membro recebe LISTA
    // VAZIA (200 { tasks: [] }), nao 403. MANAGE_USERS ve qualquer projeto pedido.
    if (query.projectId && !hasPermission(actorRoles, "MANAGE_USERS")) {
      const memberships = await this.dependencies.actors.getUserProjectMemberships(actorId)
      if (!memberships.some((membership) => membership.projectId === query.projectId)) {
        return []
      }
    }

    const scopedTasks = canListAllTasks(actorRoles)
      ? await this.dependencies.tasks.findAll()
      : await this.scopedForActor(actorId)

    const sharedTasks = (await this.dependencies.tasks.findAll()).filter(
      (task) => task.isGlobal || (task.taskVisibility === "public" && !task.projectId),
    )

    if (query.projectId) {
      const projectScoped = scopedTasks.filter((task) => task.projectId === query.projectId)
      const projectShared = sharedTasks.filter(
        (task) => task.projectId === query.projectId && task.taskVisibility === "public",
      )
      return await this.withSubtasks(
        await applyActorProgressToTasks(
          dedupeTasksById([...projectScoped, ...projectShared]),
          actorId,
          this.dependencies,
        ),
      )
    }

    return await this.withSubtasks(
      await applyActorProgressToTasks(
        dedupeTasksById([...scopedTasks, ...sharedTasks]),
        actorId,
        this.dependencies,
      ),
    )
  }

  private async withSubtasks(tasks: Task[]) {
    return await batchAttachSubtasks(tasks, this.dependencies.subtasks)
  }

  private async scopedForActor(actorId: number) {
    const [assignedTasks, memberships, assignedTaskIds] = await Promise.all([
      this.dependencies.tasks.findByAssigneeId(actorId),
      this.dependencies.actors.getUserProjectMemberships(actorId),
      this.dependencies.assignees.isAvailable()
        ? this.dependencies.assignees.listTaskIdsByUserId(actorId)
        : Promise.resolve([] as number[]),
    ])

    const allTasks = await this.dependencies.tasks.findAll()
    const projectIds = new Set(memberships.map((membership) => membership.projectId))
    const assignedTaskIdSet = new Set(assignedTaskIds)

    const visibleProjectTasks = allTasks.filter((task) => task.projectId && projectIds.has(task.projectId))
    const explicitlyAssignedTasks = allTasks.filter((task) => task.id && assignedTaskIdSet.has(task.id))

    return dedupeTasksById([...assignedTasks, ...explicitlyAssignedTasks, ...visibleProjectTasks])
  }
}
