import { ForbiddenError, canActorReadUserCpf, canActorViewProfile, resolveUserListVisibility } from "@/backend/domain"
import type { ListUsersForActorQuery } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"
import type { ProfileVisibilityPort } from "@/backend/modules/user-management/application/ports/profile-visibility.port"

/**
 * ListUsersForActorUseCase — field-level visibility rule (OND2-B2, R2).
 * The policy is the pure domain function `resolveUserListVisibility`; this use case enforces
 * it (frozen denial message) and shapes the rows exactly like the gateway's Prisma `select`
 * did (email for full/managing roles, bio only for full roles).
 *
 * B6-4 (D4): a query passou a levar o `ActorRef` em vez do `actorRoles` cru que a rota
 * entregava — o veredito pré-calculado com outra grafia (mesmo achado do escopo de purchases
 * no B6-2d). A política e a mensagem de negação não mudaram. System actor não tem papéis: cai
 * na negação congelada (medido: nenhuma rotina chama este use case; o bypass do DEC-54 não se
 * aplica a uma regra de VISIBILIDADE de lista, que é sobre papéis).
 *
 * V5-12 (DEC-143/177): além dos CAMPOS por papel, a LINHA obedece ao `profileVisibility` da
 * pessoa — `canActorViewProfile` decide linha a linha (gestão vê todas; `private` some para
 * quem não é gestão; `members_only` casa pelo vínculo em comum medido pela porta). A política
 * de campos de cima não mudou; a de linhas é nova.
 */
export class ListUsersForActorUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly profileVisibility?: ProfileVisibilityPort,
  ) {}

  async execute(query: ListUsersForActorQuery) {
    const visibility = resolveUserListVisibility(
      // `roles` e `unknown` no ActorRef (chega da sessao); `requireApiActor` normaliza antes
      // de a rota construir o ator — mesmo fluxo que `hasPermission` ja consome.
      query.actor.kind === "user" ? (query.actor.roles as readonly string[]) : [],
    )

    if (!visibility.canViewBasicUsers) {
      throw new ForbiddenError("Usuário não tem permissão para visualizar outros usuários")
    }

    const rows = await this.repository.findActiveUsers()

    const sharedIds =
      query.actor.kind === "user" && this.profileVisibility
        ? new Set(await this.profileVisibility.findSharedProjectUserIds(query.actor.id))
        : new Set<number>()

    return rows
      .filter(
        (row) =>
          canActorViewProfile(
            query.actor,
            { id: row.id, profileVisibility: row.profileVisibility, status: row.status },
            sharedIds.has(row.id),
          ),
      )
      .map((row) => {
      const out: Record<string, unknown> = {
        id: row.id,
        name: row.name,
        roles: row.roles,
        status: row.status,
        weekHours: row.weekHours,
        points: row.points,
        // V8-5 (DEC-215): a moeda é a carteira da pessoa — entra na linha sob a MESMA regra do CPF
        // (`canActorReadUserCpf`: próprio OU gestão), porque o consumidor é a loja da própria
        // pessoa e o ajuste do painel. Publicar saldo de moeda de todo mundo para todo autenticado
        // não é decisão do modelo, e não é o que a tela precisa.
        coins: canActorReadUserCpf(query.actor, row.id) ? row.coins ?? 0 : undefined,
        completedTasks: row.completedTasks,
        avatar: row.avatar,
        // V5-3 (DEC-137): a capa chega na mesma lista que o avatar, porque é o pódio do ranking que
        // a renderiza — sem isto a tela teria que chamar uma rota por pessoa.
        bannerKey: row.bannerKey,
        // V5-4a (DEC-138): os dados de pessoa que o perfil mostra abertamente. Estão na lista
        // porque é a lista que o painel e a tela de equipe usam; chamar uma rota por pessoa para
        // exibir curso e modalidade seria o mesmo erro que o comentário de cima evita.
        registrationNumber: row.registrationNumber,
        course: row.course,
        scholarshipType: row.scholarshipType,
        fundingAgency: row.fundingAgency,
        fundingAgencyOther: row.fundingAgencyOther,
        level: row.level,
      }
      if (visibility.canViewFullUsers || visibility.canManageProjectMembers) {
        out.email = row.email
      }
      if (visibility.canViewFullUsers) {
        out.bio = row.bio
        // DEC-138: o CPF é o único campo de pessoa com leitura restrita. `canViewFullUsers` é
        // COORDENADOR|GERENTE, que é exatamente MANAGE_USERS — a gestão que edita o campo no painel.
        out.cpf = row.cpf
      }
      return out
    })
  }
}
