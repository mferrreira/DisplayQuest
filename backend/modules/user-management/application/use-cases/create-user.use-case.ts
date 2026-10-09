import {
  ConflictError,
  CREATE_USER_DENIED_MESSAGE,
  requireActorPermission,
  ValidationError,
} from "@/backend/domain"
import type { CreateUserCommand } from "@/backend/modules/user-management/application/contracts"
import type { PasswordHasher } from "@/backend/modules/user-management/application/ports/password-hasher"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"
import { toPublicUser } from "@/backend/domain"

/**
 * CreateUserUseCase — registration rules (OND2-B2, R2; moved from UserServiceGateway).
 * Validation messages frozen by the golden matrix (OND2-B1). Hashing delegated to the
 * PasswordHasher port (cost 12, as today). Defaults forced exactly as the gateway did.
 *
 * B6-4 (D4): gate MANAGE_USERS com a mensagem própria, agora no domínio
 * (`user-denied-messages.ts` — a rota precisa conhecê-la para o assert, e RG-06 não deixa a
 * rota importar o módulo). A rota recheca antes do parse (AssertCanManageUsersUseCase) para
 * preservar a ordem medida 403-antes-do-corpo.
 */
export class CreateUserUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(command: CreateUserCommand) {
    // B6-4 (D4): MANAGE_USERS com a mensagem própria da rota. A rota recheca antes do parse
    // (AssertCanManageUsersUseCase) para preservar a ordem medida 403-antes-do-corpo.
    requireActorPermission(command.actor, "MANAGE_USERS", CREATE_USER_DENIED_MESSAGE)
    if (!command.name?.trim()) throw new ValidationError("Nome é obrigatório")
    if (!command.email?.trim()) throw new ValidationError("Email é obrigatório")
    if (!command.password || command.password.length < 6) {
      throw new ValidationError("A senha deve ter pelo menos 6 caracteres")
    }

    const normalizedEmail = command.email.toLowerCase().trim()
    const existing = await this.repository.findByEmail(normalizedEmail)
    if (existing) throw new ConflictError("Este email já está em uso")

    const password = await this.passwordHasher.hash(command.password, 12)

    const created = await this.repository.create({
      name: command.name.trim(),
      email: normalizedEmail,
      password,
      status: "active",
      roles: (command.roles ?? []) as never,
      weekHours: command.weekHours ?? 0,
      points: 0,
      completedTasks: 0,
      currentWeekHours: 0,
      profileVisibility: "public",
      bio: null,
      avatar: null,
    })

    return toPublicUser(created)
  }
}
