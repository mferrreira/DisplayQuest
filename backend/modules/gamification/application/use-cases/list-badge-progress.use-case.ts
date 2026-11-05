import { badgeProgressFor, isMetricId, NotFoundError } from "@/backend/domain"
import type { BadgeCriteriaV2, MetricId } from "@/backend/domain"
import type { BadgeMetricsPort } from "@/backend/modules/gamification/application/ports/badge-metrics.port"
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port"
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port"
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"

/**
 * ListBadgeProgressUseCase — plan-v15 S10 (R7, CA4). A lista "X de Y" das badges ativas
 * NÃO conquistadas, pela cláusula de menor razão (a mais distante), nunca a média.
 *
 * Fontes: as 35 métricas do registro saem da MESMA `BadgeMetricsPort` do S03 (as 6 base
 * foram adicionadas lá com as consultas congeladas do stats port) — não existe segunda
 * fonte de contagem. Métrica sem valor medido não entra; badge sem criteria v2 não tem
 * progresso. Ordem: razão crescente, depois id — a tela mostra a mais longe primeiro.
 */

export interface BadgeProgressEntry {
  badgeId: number
  name: string
  value: number
  target: number
}

export interface ListBadgeProgressDependencies {
  users: GamificationUsersPort
  badges: BadgeCatalogPort
  userBadges: UserBadgePort
  metrics: BadgeMetricsPort
}

export class ListBadgeProgressUseCase {
  constructor(private readonly dependencies: ListBadgeProgressDependencies) {}

  async execute(userId: number): Promise<BadgeProgressEntry[]> {
    const user = await this.dependencies.users.findUserById(userId)
    if (!user) throw new NotFoundError("Usuário não encontrado")

    const active = await this.dependencies.badges.findActive()
    const earnedIds = new Set((await this.dependencies.userBadges.findByUserId(userId)).map((ub) => ub.badgeId))

    const pending = active.filter(
      (b) => b.id !== undefined && !earnedIds.has(b.id) && b.criteria != null && (b.criteria as { version?: unknown }).version === 2,
    )
    if (pending.length === 0) return []

    const ids = new Set<MetricId>()
    for (const badge of pending) {
      for (const clause of (badge.criteria as BadgeCriteriaV2).clauses) {
        if (isMetricId(clause.metric)) ids.add(clause.metric)
      }
    }

    const values = await this.dependencies.metrics.computeValues(user.id, [...ids])

    const entries: Array<BadgeProgressEntry & { ratio: number }> = []
    for (const badge of pending) {
      const progress = badgeProgressFor(values, badge.criteria as BadgeCriteriaV2)
      if (!progress) continue
      entries.push({
        badgeId: badge.id as number,
        name: badge.name,
        value: progress.value,
        target: progress.target,
        ratio: progress.value / progress.target,
      })
    }

    entries.sort((a, b) => (a.ratio - b.ratio) || (a.badgeId - b.badgeId))
    return entries.map(({ ratio, ...entry }) => entry)
  }
}
