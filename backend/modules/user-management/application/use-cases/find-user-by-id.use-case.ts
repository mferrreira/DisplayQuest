import {
  ACCESS_DENIED_MESSAGE,
  ForbiddenError,
  canActorReadUserCpf,
  canActorViewProfile,
  toPublicUser,
  toPublicUserWithCpf,
} from "@/backend/domain";
import type { ActorRef } from "@/backend/domain";
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository";
import type { ProfileVisibilityPort } from "@/backend/modules/user-management/application/ports/profile-visibility.port";

/**
 * FindUserByIdUseCase — read use case (OND2-B2). Returns the public shape (no password), same
 * as the model's toJSON today.
 *
 * B6-4 (D4): self || MANAGE_USERS. As duas rotas que leem um usuário congelaram MENSAGENS
 * DIFERENTES para a mesma regra — "Acesso negado" (users/[id]) e "Não autorizado" (profile) —
 * então a mensagem entra como parâmetro (a decisão é uma; a string é contrato de rota). Os
 * chamadores de avatar (users/avatar, users/[id]/avatar) operam sempre em self e passam pelo
 * gate; a trava self-only dessas duas rotas fica onde está (elas não são do D4).
 *
 * V5-4a (DEC-138): o CPF sai por aqui, e sai POR CAMADA: `canActorReadUserCpf` (próprio OU
 * gestão) projeta com CPF; os demais que a visibilidade deixou entrar recebem a projeção SEM
 * CPF. A LISTA de usuários é outro caminho (`ListUsersForActorUseCase`) e é lá que a restrição
 * decide tier por tier.
 *
 * V5-12 (DEC-143/177): o gate deixou de ser `self OU MANAGE_USERS` para todo mundo e passou a
 * ser a regra do próprio campo `profileVisibility` — `public` abre ao autenticado,
 * `members_only` casa por projeto em comum (a porta `ProfileVisibilityPort` mede o vínculo;
 * sem porta injetada o vínculo é `false`, conservador), `private` é exatamente o gate antigo.
 * Consequência medida da ordem: a decisão precisa do ALVO, então a leitura vem antes da
 * recusa — usuário ausente é 404 para quem quer que seja; existente mas invisível é 403 com a
 * mensagem congelada da rota.
 */
export class FindUserByIdUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly profileVisibility?: ProfileVisibilityPort,
  ) {}

  async execute(actor: ActorRef, userId: number, deniedMessage?: string) {
    const user = await this.repository.findById(userId);
    if (!user) return null;

    const sharesProject = await this.sharesProjectWith(actor, user.id, user.profileVisibility);
    if (
      !canActorViewProfile(
        actor,
        { id: user.id, profileVisibility: user.profileVisibility, status: user.status },
        sharesProject,
      )
    ) {
      throw new ForbiddenError(deniedMessage ?? ACCESS_DENIED_MESSAGE);
    }

    return canActorReadUserCpf(actor, userId) ? toPublicUserWithCpf(user) : toPublicUser(user);
  }

  /** O vínculo só é consultado quando o valor do alvo é `members_only` — os outros ramos não perguntam. */
  private async sharesProjectWith(
    actor: ActorRef,
    targetId: number,
    visibility: string,
  ): Promise<boolean> {
    if (actor.kind !== "user" || visibility !== "members_only" || !this.profileVisibility) return false;
    const sharedIds = await this.profileVisibility.findSharedProjectUserIds(actor.id);
    return sharedIds.includes(targetId);
  }
}
