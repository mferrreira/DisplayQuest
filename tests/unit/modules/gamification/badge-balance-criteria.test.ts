// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

import type { Badge } from "@/backend/domain"
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port"
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port"
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port"
import type { UserStatsPort } from "@/backend/modules/gamification/application/ports/user-stats.port"
import { EvaluateUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case"

describe("S11 — critérios de badge continuam medindo o saldo", () => {
  it("atinge o critério pelo saldo mesmo quando o placar mensal está zerado", async () => {
    const badge: Badge = {
      id: 3,
      name: "Poupador",
      description: "Acumulou 100 pontos",
      category: "milestone",
      criteria: { points: 100 },
      isActive: true,
      createdBy: 1,
    }
    const create = vi.fn(async ({ userId, badgeId, earnedBy }: { userId: number; badgeId: number; earnedBy: number | null }) => ({
      id: 10,
      userId,
      badgeId,
      earnedBy,
      earnedAt: new Date("2026-10-28T12:00:00.000Z"),
    }))
    const useCase = new EvaluateUserBadgesUseCase({
      users: {
        findUserById: async () => ({
          id: 42,
          points: 100,
          currentMonthPoints: 0,
          completedTasks: 0,
          weekHours: 0,
          roles: ["VOLUNTARIO"],
        }),
        findAllUsers: async () => [],
      } as unknown as GamificationUsersPort,
      badges: { findActive: async () => [badge] } as unknown as BadgeCatalogPort,
      userBadges: { findByUserId: async () => [], create } as unknown as UserBadgePort,
      stats: {
        projectsCount: async () => 0,
        workSessionsCount: async () => 0,
        weeklyHoursSamples: async () => [],
        dailyLogDates: async () => [],
      } as UserStatsPort,
    })

    expect(await useCase.execute(42)).toEqual([badge])
    expect(create).toHaveBeenCalledWith({ userId: 42, badgeId: 3, earnedBy: null })
  })
})
