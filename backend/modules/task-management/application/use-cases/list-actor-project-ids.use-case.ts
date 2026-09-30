import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";

/** ListActorProjectIdsUseCase — OND4-B3 (R1): thin read through the actors port. */
export class ListActorProjectIdsUseCase {
  constructor(private readonly actors: TaskActorsPort) {}

  async execute(actorId: number) {
    const memberships = await this.actors.getUserProjectMemberships(actorId)
    return memberships.map((membership) => membership.projectId)
  }
}
