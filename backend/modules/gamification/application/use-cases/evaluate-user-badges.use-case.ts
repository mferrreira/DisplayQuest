import { NotFoundError, averageWeeklyHoursFrom, maxConsecutiveDaysFrom, selectBadgesToAward } from "@/backend/domain"
import type { Badge } from "@/backend/domain"
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port"
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port"
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"
import type { UserStatsPort } from "@/backend/modules/gamification/application/ports/user-stats.port"

/**
 * EvaluateUserBadgesUseCase — OND6-B2 (R2). Congelado do golden OND6-B1
 * (BadgeRulesEngine.evaluateUserForBadges + getUserStatistics):
 *   - so badges ATIVOS sao avaliados;
 *   - badges ja conquistados sao pulados;
 *   - stats agregados pelas regras puras (media das 4 semanas mais novas, streak max);
 *   - falha de concessao continua engolida com console.error (padrao da casa).
 *
 * DIVERGENCIA DOCUMENTADA (QUIRK-6A corrigido na impl nova): o caminho legado passava
 * objeto plain para UserBadgeRepository.create -> .toPrisma() TypeError -> badge
 * automatico NUNCA era concedido. Aqui o port recebe o DADO e a concessao FUNCIONA.
 * A divergencia e pinada explicitamente no contract suite (OND6-B3) e submetida ao dono.
 */

export interface EvaluateUserBadgesDependencies {
  users: GamificationUsersPort
  badges: BadgeCatalogPort
  userBadges: UserBadgePort
  stats: UserStatsPort
}

export class EvaluateUserBadgesUseCase {
  constructor(private readonly dependencies: EvaluateUserBadgesDependencies) {}

  async execute(userId: number): Promise<Badge[]> {
    const user = await this.dependencies.users.findUserById(userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const activeBadges = await this.dependencies.badges.findActive()
    if (activeBadges.length === 0) {
      return []
    }

    const earned = await this.dependencies.userBadges.findByUserId(userId)
    const earnedBadgeIds = earned.map((ub) => ub.badgeId)

    const [projectsCount, workSessionsCount, weeklySamples, dailyDates, allUsers] = await Promise.all([
      this.dependencies.stats.projectsCount(userId),
      this.dependencies.stats.workSessionsCount(userId),
      this.dependencies.stats.weeklyHoursSamples(userId),
      this.dependencies.stats.dailyLogDates(userId),
      this.dependencies.users.findAllUsers(),
    ])

    const stats = {
      points: user.points,
      completedTasks: user.completedTasks,
      projectsCount,
      workSessionsCount,
      averageWeeklyHours: averageWeeklyHoursFrom(weeklySamples),
      maxConsecutiveDays: maxConsecutiveDaysFrom(dailyDates),
    }

    const toAward = selectBadgesToAward({
      badges: activeBadges,
      earnedBadgeIds,
      userId: user.id,
      stats,
      roles: user.roles,
      weekHours: user.weekHours,
      allUsers,
    })

    const awarded: Badge[] = []
    for (const badge of toAward) {
      try {
        await this.dependencies.userBadges.create({
          userId: user.id,
          badgeId: badge.id!,
          earnedBy: null,
        })
        awarded.push(badge)
      } catch (error) {
        console.error(`Error awarding badge ${badge.id} to user ${user.id}:`, error)
      }
    }

    return awarded
  }
}
