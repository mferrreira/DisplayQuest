import type { ListTasksForActorQuery } from "@/backend/modules/task-management/application/contracts"
import type { TaskManagementGateway } from "@/backend/modules/task-management/application/ports/task-management.gateway"

export class ListTasksForActorUseCase {
  constructor(private readonly gateway: TaskManagementGateway) {}

  async execute(query: ListTasksForActorQuery) {
    const scopedTasks = await this.gateway.listTasksForUser(query.actorId, query.actorRoles)

    if (query.projectId) {
      return scopedTasks.filter((task) => task.projectId === query.projectId)
    }

    const globalTasks = await this.gateway.listGlobalTasks()
    return [...scopedTasks, ...globalTasks]
  }
}
