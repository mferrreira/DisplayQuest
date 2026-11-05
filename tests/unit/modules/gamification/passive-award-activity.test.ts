/**
 * plan-v15 S06 (R10, demo da fatia) — a parcela de atividade entra multiplicada pela passiva
 * do MEMBRO, na escrita. O que este arquivo trava:
 *  - parcela 40 com +10%: crédito 44;
 *  - bônus 60% + 50% cortado a 100%: 40 creditam 80;
 *  - sem passiva: a parcela do base passa igual (a escala Hamilton é do domínio de projeto,
 *    DEC-103 — gamification não re-aritmética);
 *  - idempotência por membro: a segunda passada devolve 0 e a porta não é lida.
 */
import { describe, expect, it } from "vitest";

import type { BadgeEffect } from "@/backend/domain";
import type { GamificationAwardHistoryPort, AwardLookup, AwardRecord } from "@/backend/modules/gamification/application/ports/gamification-award-history.port";
import type { EquippedPassivesPort } from "@/backend/modules/gamification/application/ports/equipped-passives.port";
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port";
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port";
import type { UserStatsPort } from "@/backend/modules/gamification/application/ports/user-stats.port";
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port";
import { EvaluateUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case";
import { GetUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/get-user-progression.use-case";
import { AwardFromActivityCompletionUseCase } from "@/backend/modules/gamification/application/use-cases/award-from-activity-completion.use-case";

function makeUseCase(effects: BadgeEffect[], alreadyAwarded = false) {
  const writes: Array<{ pointsAwarded: number; description: string }> = [];
  const awardHistory: GamificationAwardHistoryPort = {
    async hasAward(_lookup: AwardLookup) {
      return alreadyAwarded;
    },
    async awardAndRecord(data: AwardRecord) {
      writes.push({ pointsAwarded: data.pointsAwarded, description: data.description });
    },
  } as unknown as GamificationAwardHistoryPort;

  const users = {
    async findProgressionById(userId: number) {
      return { id: userId, points: 0 };
    },
    async findUserById(userId: number) {
      return { id: userId, points: 0, completedTasks: 0, weekHours: 0, roles: [] };
    },
    async findAllUsers() {
      return [];
    },
  } as unknown as GamificationUsersPort;

  const passives: EquippedPassivesPort & { reads: number } = {
    reads: 0,
    async listEquippedEffects() {
      passives.reads += 1;
      return effects;
    },
  };

  const emptyBadges: BadgeCatalogPort = { async findActive() { return []; }, async findById() { return null; } } as unknown as BadgeCatalogPort;
  const emptyUserBadges: UserBadgePort = { async findByUserId() { return []; } } as unknown as UserBadgePort;
  const emptyStats: UserStatsPort = {
    async projectsCount() { return 0; },
    async workSessionsCount() { return 0; },
    async weeklyHoursSamples() { return []; },
    async dailyLogDates() { return []; },
  };

  const progression = new GetUserProgressionUseCase({ users });
  const evaluate = new EvaluateUserBadgesUseCase({
    users, badges: emptyBadges, userBadges: emptyUserBadges, stats: emptyStats, metrics: { async computeValues() { return {}; } },
  });

  return {
    useCase: new AwardFromActivityCompletionUseCase({ awardHistory, progression, evaluateUserBadges: evaluate, passives }),
    writes,
    passives,
  };
}

describe("AwardFromActivityCompletionUseCase com passiva do membro", () => {
  it("parcela 40 com +10% creditada 44", async () => {
    const { useCase, writes } = makeUseCase([{ kind: "bonus", pct: 0.1 }]);
    const result = await useCase.execute({ userId: 3, activityId: 21, points: 40 });
    expect(result.pointsAwarded).toBe(44);
    expect(writes[0].pointsAwarded).toBe(44);
    expect(writes[0].description).toBe("GAMIFICATION:ACTIVITY_COMPLETED:21");
  });

  it("cap +100%: 60% + 50% cortados a 100% — parcela 40 creditada 80", async () => {
    const { useCase } = makeUseCase([{ kind: "bonus", pct: 0.6 }, { kind: "bonus", pct: 0.5 }]);
    const result = await useCase.execute({ userId: 3, activityId: 22, points: 40 });
    expect(result.pointsAwarded).toBe(80);
  });

  it("sem passiva: a parcela chega igual — a escala Hamilton não é re-aritmética", async () => {
    const { useCase } = makeUseCase([]);
    const result = await useCase.execute({ userId: 3, activityId: 23, points: 40 });
    expect(result.pointsAwarded).toBe(40);
  });

  it("idempotência por membro: segunda passada devolve 0 e a porta não é lida", async () => {
    const { useCase, writes, passives } = makeUseCase([{ kind: "bonus", pct: 0.1 }], true);
    const result = await useCase.execute({ userId: 3, activityId: 24, points: 40 });
    expect(result.pointsAwarded).toBe(0);
    expect(result.alreadyAwarded).toBe(true);
    expect(writes).toHaveLength(0);
    expect(passives.reads).toBe(0);
  });
});
