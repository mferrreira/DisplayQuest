import type { ListTasksForActorQuery } from "@/backend/modules/task-management/application/contracts"
import type { TaskManagementGateway } from "@/backend/modules/task-management/application/ports/task-management.gateway"

export class ListTasksForActorUseCase {
  constructor(private readonly gateway: TaskManagementGateway) {}

  async execute(query: ListTasksForActorQuery) {
    const scopedTasks = await this.gateway.listTasksForUser(query.actorId, query.actorRoles)
    const sharedTasks = await this.gateway.listGlobalTasks()

    if (query.projectId) {
      const projectScoped = scopedTasks.filter((task) => task.projectId === query.projectId)
      const projectShared = sharedTasks.filter((task) => task.projectId === query.projectId && task.taskVisibility === "public")
      const tasks = dedupeTasksById([...projectScoped, ...projectShared])
      return await this.gateway.applyActorProgress(tasks, query.actorId)
    }

    const tasks = dedupeTasksById([...scopedTasks, ...sharedTasks])
    return await this.gateway.applyActorProgress(tasks, query.actorId)
  }
}

function dedupeTasksById<T extends { id?: number }>(tasks: T[]) {
  const seen = new Set<number>()
  return tasks.filter((task) => {
    if (!task.id) return true
    if (seen.has(task.id)) return false
    seen.add(task.id)
    return true
  })
}
