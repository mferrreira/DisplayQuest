import { ConflictError, filterSelfEditableUserFields, hasPermission, NotFoundError, requireActorSelfOrPermission, ValidationError, normalizeAvatar, toPublicUser } from "@/backend/domain"
import type { ActorRef } from "@/backend/domain"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * UpdateUserUseCase — admin/self profile update rules (OND2-B2, R2; moved from the gateway).
 * Frozen details: duplicate-email check BEFORE the empty-email check; avatar via the pure
 * `normalizeAvatar` policy; roles deduped; weekHours coerced with Number(); status with String().
 *
 * B6-4 (D4): self || MANAGE_USERS (mensagem default "Acesso negado", a da rota) e a TRAVA DE
 * CAMPOS desceu junto — o `Object.fromEntries` inline da rota (quem não tem MANAGE_USERS só
 * escreve os seis campos self-editáveis) era decisão de escopo na camada HTTP, a mesma dívida
 * do veredito pré-calculado achada no B6-2d. A regra pura é `filterSelfEditableUserFields`.
 * System actor (bypass declarado DEC-54) escreve o corpo inteiro.
 */
export class UpdateUserUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(actor: ActorRef, userId: number, data: Record<string, unknown>) {
    requireActorSelfOrPermission(actor, userId, "MANAGE_USERS")
    const canManageUsers = actor.kind === "system" || hasPermission(actor.roles, "MANAGE_USERS")
    const editableData = canManageUsers ? data : filterSelfEditableUserFields(data)

    const currentUser = await this.repository.findById(userId)
    if (!currentUser) {
      throw new NotFoundError("Usuário não encontrado")
    }

    if (editableData.name !== undefined) {
      const name = String(editableData.name || "").trim()
      if (!name) throw new ValidationError("Nome é obrigatório")
      currentUser.name = name
    }

    if (editableData.email !== undefined) {
      const email = String(editableData.email || "").trim()
      const existingUser = await this.repository.findByEmail(email)
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictError("Email já está em uso")
      }
      if (!email) throw new ValidationError("Email inválido")
      currentUser.email = email.toLowerCase()
    }

    if (editableData.bio !== undefined) currentUser.bio = editableData.bio ? String(editableData.bio) : null
    if (editableData.avatar !== undefined) currentUser.avatar = normalizeAvatar(editableData.avatar)
    if (editableData.profileVisibility !== undefined) currentUser.profileVisibility = editableData.profileVisibility as never
    if (editableData.weekHours !== undefined) currentUser.weekHours = Number(editableData.weekHours)
    if (editableData.status !== undefined) currentUser.status = String(editableData.status)

    if (editableData.roles !== undefined && Array.isArray(editableData.roles)) {
      currentUser.roles = [...new Set(editableData.roles as never[])]
    }

    return toPublicUser(await this.repository.update(currentUser))
  }
}
