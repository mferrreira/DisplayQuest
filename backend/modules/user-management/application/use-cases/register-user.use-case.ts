import { ConflictError, ValidationError } from "@/backend/domain"
import type { RegisterUserCommand } from "@/backend/modules/user-management/application/contracts"
import type { PasswordHasher } from "@/backend/modules/user-management/application/ports/password-hasher"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"
import { toPublicUser } from "@/backend/domain"

/**
 * RegisterUserUseCase — public self-registration flow (OND2-B3; moved out of
 * app/api/auth/register/route.ts, which talked to Prisma/bcrypt directly).
 *
 * Distinct from CreateUserUseCase on purpose (frozen by the current route):
 *   - validation messages are the register form's ("Nome, email e senha são obrigatórios");
 *   - status is "pending" (goes through moderation), roles [] and weekHours 0 — the admin
 *     approval flow (moderatePendingUser) is what activates the account;
 *   - hash cost 12, same as admin creation.
 */
export class RegisterUserUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(command: RegisterUserCommand) {
    const { name, email, password } = command
    if (!name || !email || !password) {
      throw new ValidationError("Nome, email e senha são obrigatórios")
    }
    if (password.length < 6) {
      throw new ValidationError("A senha deve ter pelo menos 6 caracteres")
    }

    const normalizedEmail = String(email).toLowerCase().trim()
    const existing = await this.repository.findByEmail(normalizedEmail)
    if (existing) {
      throw new ConflictError("Este email já está em uso")
    }

    const passwordHash = await this.passwordHasher.hash(String(password), 12)

    const created = await this.repository.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password: passwordHash,
      status: "pending",
      roles: [],
      weekHours: 0,
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
