import { resolveCanActorAccessProject } from "@/backend/modules/project-management/application/use-cases/internal/project-access"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"

/**
 * CanActorAccessProjectUseCase — OND5-B2 (R2). The decision is
 * domain/canActorAccessProjectDecision (MANAGE_USERS/MANAGE_PROJECTS bypass -> membership
 * -> leader/creator). Global roles short-circuit BEFORE any read (frozen: the legacy
 * gateway touched no table for managers).
 *
 * V5-2c: o corpo passou a delegar ao `resolveCanActorAccessProject`, a mesma peça que a
 * leitura de entregáveis e anexos usa. Comportamento inalterado — o que mudou é que deixou de
 * existir uma segunda cópia da regra para os use cases novos.
 */
export interface CanActorAccessProjectDependencies {
  actors: ProjectActorsPort
}

export class CanActorAccessProjectUseCase {
  constructor(private readonly dependencies: CanActorAccessProjectDependencies) {}

  async execute(projectId: number, actorId: number, actorRoles: unknown) {
    return await resolveCanActorAccessProject(
      { actors: this.dependencies.actors },
      projectId,
      actorId,
      actorRoles,
    )
  }
}
