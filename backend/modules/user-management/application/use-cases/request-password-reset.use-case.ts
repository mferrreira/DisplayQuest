import { ConflictError, requireActorPermission, validatePasswordResetInput, PASSWORD_RESET_DUPLICATE_MESSAGE, PENDING_MODERATION_DENIED_MESSAGE } from "@/backend/domain";
import type { ActorRef } from "@/backend/domain";
import type { PasswordResetPort } from "@/backend/modules/user-management/application/ports/password-reset.port";
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository";
import type { PasswordHasher } from "@/backend/modules/user-management/application/ports/password-hasher";

/**
 * RequestPasswordResetUseCase — envio público da solicitação de troca de senha
 * (plan-v24 S01, ADR-001/ADR-002).
 *
 * A rota pública é o primeiro endpoint sem ator que cria dado no sistema. O desenho é o
 * do `RegisterUserUseCase` espelhado: validação no domínio, hash custo 12, e a resposta
 * que não revela se o email existe — `null` quando o email não tem conta (a rota devolve
 * a mesma mensagem nos dois casos, INV2).
 *
 * Pending repetido para o mesmo email: ConflictError com a frase congelada (ADR-004, INV4).
 * A conta não é tocada por este caminho — senha e status ficam intactos (INV3).
 */
export class RequestPasswordResetUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly resets: PasswordResetPort,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(command: { email?: string | null; password?: string | null }) {
    const { email, password } = validatePasswordResetInput(command);

    const user = await this.users.findByEmail(email);
    if (!user) return null;

    const pending = await this.resets.findPendingByEmail(email);
    if (pending) {
      throw new ConflictError(PASSWORD_RESET_DUPLICATE_MESSAGE);
    }

    const passwordHash = await this.passwordHasher.hash(password, 12);
    const created = await this.resets.createPending({ email, password: passwordHash });

    // Projeção pública: a hash nunca sai do módulo.
    return {
      id: created.id,
      email: created.email,
      status: created.status,
      createdAt: created.createdAt,
    };
  }
}

/**
 * ListPasswordResetRequestsUseCase — leitura da gestão (S01, CA6, ADR-003).
 *
 * Gate `MANAGE_USERS` com a mensagem congelada da moderação de contas. A lista nunca traz
 * a hash: a projeção tira a coluna antes de devolver.
 */
export class ListPasswordResetRequestsUseCase {
  constructor(private readonly resets: PasswordResetPort) {}

  async execute(actor: ActorRef) {
    requireActorPermission(actor, "MANAGE_USERS", PENDING_MODERATION_DENIED_MESSAGE);
    const rows = await this.resets.listPending();
    return rows.map(({ password, ...row }) => row);
  }
}
