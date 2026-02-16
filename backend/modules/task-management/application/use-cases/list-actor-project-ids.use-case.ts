import type { TaskManagementGateway } from "@/backend/modules/task-management/application/ports/task-management.gateway"

export class ListActorProjectIdsUseCase {
  constructor(private readonly gateway: TaskManagementGateway) {}

  async execute(actorId: number) {
    return await this.gateway.listActorProjectIds(actorId)
  }
}
