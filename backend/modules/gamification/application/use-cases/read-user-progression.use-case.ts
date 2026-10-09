import { requireActorSelfOrPermission, type ActorRef, type UserProgression } from "@/backend/domain"
import type { GetUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/get-user-progression.use-case"

/**
 * ReadUserProgressionUseCase — the route-facing half of `GET /api/users/[id]/gamification`
 * (D4, B6-2c, DEC-115).
 *
 * The gate that used to sit in the route is `ensureSelfOrPermission(actor, userId, "MANAGE_USERS")`:
 * the owner reads their own progression, COORDENADOR/GERENTE read anyone's. Here it becomes
 * `requireActorSelfOrPermission`, with a byte-identical rule.
 *
 * It is a separate use case rather than a field on `GetUserProgressionUseCase` because that one
 * has callers other than this route: `AwardFromTaskCompletionUseCase` and
 * `AwardFromWorkSessionUseCase` use it as a pure lookup inside award flows, where there is no
 * person choosing whose progression to read. Adding an actor there would either break them or
 * force a `systemActor` into a lookup. So the lookup stays actor-less and the authorisation
 * lives in the use case the route calls.
 *
 * The ORDER is preserved by construction: the route validates `params.id` (400 "Usuário
 * inválido") BEFORE calling this — which matches today, where the validation precedes the gate.
 */
export class ReadUserProgressionUseCase {
  constructor(private readonly progression: GetUserProgressionUseCase) {}

  async execute(command: { actor: ActorRef; userId: number }): Promise<UserProgression> {
    requireActorSelfOrPermission(command.actor, command.userId, "MANAGE_USERS")
    return await this.progression.execute(command.userId)
  }
}
