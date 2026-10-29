import { canActorViewProfile, toPublicUser } from "@/backend/domain";
import type { ListUserProfilesQuery } from "@/backend/modules/user-management/application/contracts";
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository";
import type { ProfileVisibilityPort } from "@/backend/modules/user-management/application/ports/profile-visibility.port";

/**
 * ListProfilesUseCase — frozen quirk (golden OND2-B1): BOTH query types call
 * findByProfileVisibility("public"), and the repository currently returns ALL users. Changing
 * this is a behaviour decision for the owner, not a clean-arch side effect.
 *
 * V5-12 (DEC-143/177) é essa decisão: o quirk do repositório (o argumento de visibilidade é
 * ignorado) permanece, mas o USE CASE filtra linha a linha pela regra do perfil —
 * `canActorViewProfile`. O que a busca de pessoas devolve passa a ser o que o ator pode ver:
 * gestão busca qualquer pessoa (inclusive para adicionar um `private` ao projeto), o resto não
 * enxerga o que a visibilidade esconde.
 */
export class ListProfilesUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly profileVisibility?: ProfileVisibilityPort,
  ) {}

  async execute(query: ListUserProfilesQuery) {
    const rows = await this.repository.findByProfileVisibility("public")

    const sharedIds =
      query.actor.kind === "user" && this.profileVisibility
        ? new Set(await this.profileVisibility.findSharedProjectUserIds(query.actor.id))
        : new Set<number>()

    return rows
      .filter((row) =>
        canActorViewProfile(
          query.actor,
          { id: row.id, profileVisibility: row.profileVisibility, status: row.status },
          sharedIds.has(row.id),
        ),
      )
      .map(toPublicUser)
  }
}
