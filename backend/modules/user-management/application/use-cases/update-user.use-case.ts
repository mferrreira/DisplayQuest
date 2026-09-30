import { ConflictError, NotFoundError, ValidationError, normalizeAvatar, toPublicUser } from "@/backend/domain"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * UpdateUserUseCase — admin/self profile update rules (OND2-B2, R2; moved from the gateway).
 * Frozen details: duplicate-email check BEFORE the empty-email check; avatar via the pure
 * `normalizeAvatar` policy; roles deduped; weekHours coerced with Number(); status with String().
 */
export class UpdateUserUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(userId: number, data: Record<string, unknown>) {
    const currentUser = await this.repository.findById(userId)
    if (!currentUser) {
      throw new NotFoundError("Usuário não encontrado")
    }

    if (data.name !== undefined) {
      const name = String(data.name || "").trim()
      if (!name) throw new ValidationError("Nome é obrigatório")
      currentUser.name = name
    }

    if (data.email !== undefined) {
      const email = String(data.email || "").trim()
      const existingUser = await this.repository.findByEmail(email)
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictError("Email já está em uso")
      }
      if (!email) throw new ValidationError("Email inválido")
      currentUser.email = email.toLowerCase()
    }

    if (data.bio !== undefined) currentUser.bio = data.bio ? String(data.bio) : null
    if (data.avatar !== undefined) currentUser.avatar = normalizeAvatar(data.avatar)
    if (data.profileVisibility !== undefined) currentUser.profileVisibility = data.profileVisibility as never
    if (data.weekHours !== undefined) currentUser.weekHours = Number(data.weekHours)
    if (data.status !== undefined) currentUser.status = String(data.status)

    if (data.roles !== undefined && Array.isArray(data.roles)) {
      currentUser.roles = [...new Set(data.roles as never[])]
    }

    return toPublicUser(await this.repository.update(currentUser))
  }
}
