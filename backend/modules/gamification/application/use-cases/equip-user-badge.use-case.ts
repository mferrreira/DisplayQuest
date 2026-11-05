import { ConflictError, ForbiddenError, NotFoundError, ValidationError, equipViolation, NOT_EARNED_MESSAGE, BADGE_NOT_FOUND_MESSAGE, NO_PASSIVE_MESSAGE, SLOT_FULL_MESSAGE, EQUIP_DENIED_MESSAGE } from "@/backend/domain"
import type { UserBadge } from "@/backend/domain"
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port"
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"

/**
 * EquipUserBadgeUseCase — plan-v15 S04 (MODELO R9). Equipar/desequipar uma passiva no
 * `user_badges.equipped`. Gates na ordem do estado MODELO: self, conquistada, badge
 * existe, passiva, slot livre (só para equipar). Frases congeladas no domínio
 * (`equip-rules`); o 409 "Slots de passiva cheios" é a do dono.
 */

export interface EquipUserBadgeCommand {
  actorId: number;
  userId: number;
  badgeId: number;
  equipped: boolean;
}

export class EquipUserBadgeUseCase {
  constructor(
    private readonly userBadges: UserBadgePort,
    private readonly badges: BadgeCatalogPort,
  ) {}

  async execute(command: EquipUserBadgeCommand): Promise<UserBadge> {
    const { actorId, userId, badgeId, equipped } = command

    const userBadge = await this.userBadges.findByUserAndBadge(userId, badgeId)
    const badge = userBadge ? await this.badges.findById(badgeId) : null
    const equippedCount = userBadge ? await this.userBadges.countEquippedByUserId(userId) : 0

    const violation = equipViolation({
      isSelf: actorId === userId,
      earned: userBadge !== null,
      badgeExists: badge !== null,
      passive: badge?.effect != null,
      equippedCount,
      targetEquipped: equipped,
    })

    switch (violation) {
      case "denied":
        throw new ForbiddenError(EQUIP_DENIED_MESSAGE)
      case "not-earned":
        throw new NotFoundError(NOT_EARNED_MESSAGE)
      case "badge-not-found":
        throw new NotFoundError(BADGE_NOT_FOUND_MESSAGE)
      case "no-passive":
        throw new ValidationError(NO_PASSIVE_MESSAGE)
      case "slot-full":
        throw new ConflictError(SLOT_FULL_MESSAGE)
      default:
        break
    }

    return await this.userBadges.setEquipped(userBadge!.id!, equipped)
  }
}
