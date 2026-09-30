import { NotFoundError, ValidationError, normalizeAvatar, toPublicUser } from "@/backend/domain"
import type { PasswordHasher } from "@/backend/modules/user-management/application/ports/password-hasher"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * UpdateUserProfileUseCase — self-service profile rules (OND2-B2, R2).
 * Password: set only when non-blank; the 6-char rule keeps the message the model's
 * `setPassword` threw ("Senha deve ter pelo menos 6 caracteres"); hashing via the port
 * (cost 10, as the model did). Avatar via the pure policy.
 */
export class UpdateUserProfileUseCase {
  constructor(
    private readonly repository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(userId: number, data: Record<string, unknown>) {
    const user = await this.repository.findById(userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    if (data.name !== undefined) {
      const name = String(data.name || "").trim()
      if (!name) throw new ValidationError("Nome é obrigatório")
      user.name = name
    }
    if (data.bio !== undefined) user.bio = data.bio ? String(data.bio) : null
    if (data.avatar !== undefined) user.avatar = normalizeAvatar(data.avatar)
    if (data.profileVisibility !== undefined) user.profileVisibility = data.profileVisibility as never
    if (data.weekHours !== undefined) user.weekHours = Number(data.weekHours)

    if (data.password !== undefined) {
      const password = String(data.password || "")
      if (password.trim()) {
        if (password.length < 6) {
          throw new ValidationError("Senha deve ter pelo menos 6 caracteres")
        }
        user.password = await this.passwordHasher.hash(password, 10)
      }
    }

    return toPublicUser(await this.repository.update(user))
  }
}
