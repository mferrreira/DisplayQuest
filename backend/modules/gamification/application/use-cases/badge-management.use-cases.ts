import type { Badge, UserBadge } from "@/backend/domain"
import { ConflictError, NotFoundError, applyBadgeUpdate, validateBadgeCreateInput } from "@/backend/domain"
import type {
  AwardBadgeCommand,
  CreateBadgeCommand,
  UpdateBadgeCommand,
} from "@/backend/modules/gamification/application/contracts"
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port"
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"

/**
 * Use cases de gestao de badges — OND6-B2 (R2). Congelados do golden OND6-B1
 * (BadgeEngine): validacoes de create (com QUIRK-6B e createdBy falsy), merge parcial
 * de update (sem revalidacao de categoria), mensagens exatas
 * ("Badge não encontrado", "Usuário já possui este badge", "Usuário não possui este badge").
 * Evolucao de tipo: legado lancava Error; aqui DomainError com a MESMA mensagem
 * (paridade por mensagem conforme DEC-18; status HTTP tratados em OND6-B4).
 */

export class ListBadgesUseCase {
  constructor(private readonly badges: BadgeCatalogPort) {}

  async execute(): Promise<Badge[]> {
    return await this.badges.findAll()
  }
}

export class GetBadgeByIdUseCase {
  constructor(private readonly badges: BadgeCatalogPort) {}

  async execute(id: number): Promise<Badge | null> {
    return await this.badges.findById(id)
  }
}

export class CreateBadgeUseCase {
  constructor(private readonly badges: BadgeCatalogPort) {}

  async execute(command: CreateBadgeCommand): Promise<Badge> {
    const data = validateBadgeCreateInput(command)
    return await this.badges.create(data)
  }
}

export class UpdateBadgeUseCase {
  constructor(private readonly badges: BadgeCatalogPort) {}

  async execute(command: UpdateBadgeCommand): Promise<Badge> {
    const current = await this.badges.findById(command.id)
    if (!current) {
      throw new NotFoundError("Badge não encontrado")
    }

    const merged = applyBadgeUpdate(current, command.data)
    return await this.badges.update(merged)
  }
}

export class DeleteBadgeUseCase {
  constructor(private readonly badges: BadgeCatalogPort) {}

  async execute(id: number): Promise<void> {
    const badge = await this.badges.findById(id)
    if (!badge) {
      throw new NotFoundError("Badge não encontrado")
    }

    await this.badges.delete(id)
  }
}

export class ListUserBadgesUseCase {
  constructor(private readonly userBadges: UserBadgePort) {}

  async execute(userId: number): Promise<UserBadge[]> {
    return await this.userBadges.findByUserId(userId)
  }
}

export class ListRecentUserBadgesUseCase {
  constructor(private readonly userBadges: UserBadgePort) {}

  async execute(userId: number, limit?: number): Promise<UserBadge[]> {
    // Default 10 congelado do UserBadgeRepository.findRecentByUserId (:314).
    return await this.userBadges.findRecentByUserId(userId, limit ?? 10)
  }
}

export class AwardBadgeUseCase {
  constructor(
    private readonly badges: BadgeCatalogPort,
    private readonly userBadges: UserBadgePort,
  ) {}

  async execute(command: AwardBadgeCommand): Promise<UserBadge> {
    const badge = await this.badges.findById(command.badgeId)
    if (!badge) {
      throw new NotFoundError("Badge não encontrado")
    }

    const existing = await this.userBadges.findByUserAndBadge(command.userId, command.badgeId)
    if (existing) {
      throw new ConflictError("Usuário já possui este badge")
    }

    return await this.userBadges.create({
      userId: command.userId,
      badgeId: command.badgeId,
      earnedBy: command.awardedBy || null,
    })
  }
}

export class RemoveUserBadgeUseCase {
  constructor(private readonly userBadges: UserBadgePort) {}

  async execute(userId: number, badgeId: number): Promise<void> {
    const userBadge = await this.userBadges.findByUserAndBadge(userId, badgeId)
    if (!userBadge) {
      throw new NotFoundError("Usuário não possui este badge")
    }

    await this.userBadges.delete(userBadge.id!)
  }
}
