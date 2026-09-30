import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  hasAnyRole,
  hasPermission,
  toPublicUser,
  type Role,
} from "@/backend/domain"
import type { DeductUserHoursCommand } from "@/backend/modules/user-management/application/contracts"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

const GERENTE_PROJETO: Role = "GERENTE_PROJETO"

/**
 * DeductUserHoursUseCase — hour-deduction authorization + arithmetic (OND2-B2, R2).
 *
 * Rules moved from the gateway (and its IdentityAccessModule dependency — the policy is now
 * the PURE domain function, no cross-module import):
 *   - who may deduct: MANAGE_USERS permission, or GERENTE_PROJETO with a projectId;
 *   - A4: GERENTE_PROJETO needs the victim's membership AND the actor's membership-or-lead;
 *   - frozen CHECK ORDER: currentWeekHours < hours, then hours < 0, then weekHours < hours;
 *   - weekHours reduced, currentWeekHours clamped to it.
 * The `projectId?` optionality quirk (undefined reaches the port) is preserved.
 */
export class DeductUserHoursUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(command: DeductUserHoursCommand) {
    const user = await this.repository.findById(command.userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const canDeductHours =
      hasPermission(command.deductedByRoles, "MANAGE_USERS") ||
      (hasAnyRole(command.deductedByRoles, [GERENTE_PROJETO]) && Boolean(command.projectId))
    if (!canDeductHours) {
      throw new ForbiddenError("Sem permissão para retirar horas")
    }

    if (command.projectId && hasAnyRole(command.deductedByRoles, [GERENTE_PROJETO])) {
      const membership = await this.repository.isProjectMember(command.userId, command.projectId)
      if (!membership) {
        throw new ForbiddenError("Usuário não pertence ao projeto")
      }
    }

    if (hasAnyRole(command.deductedByRoles, [GERENTE_PROJETO])) {
      const actorMembership = await this.repository.isProjectMember(command.deductedBy, command.projectId)
      const leadsProject = actorMembership
        ? true
        : await this.repository.leadsProject(command.deductedBy, command.projectId)
      if (!actorMembership && !leadsProject) {
        throw new ForbiddenError("Acesso negado")
      }
    }

    if (user.currentWeekHours < command.hours) {
      throw new ValidationError("Usuário não possui horas suficientes")
    }

    if (command.hours < 0) throw new ValidationError("Horas não podem ser negativas")
    if (user.weekHours < command.hours) throw new ValidationError("Usuário não possui horas suficientes")

    user.weekHours -= command.hours
    if (user.currentWeekHours > user.weekHours) {
      user.currentWeekHours = user.weekHours
    }
    const updatedUser = await this.repository.update(user)

    return {
      message: `${command.hours} horas retiradas com sucesso`,
      user: toPublicUser(updatedUser),
    }
  }
}
