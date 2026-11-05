/**
 * plan-v15 S05 (R10/R11, CA5/CA10) — a passiva equipada entra na ESCRITA do prêmio de
 * tarefa, depois da regra pura. O que este arquivo trava:
 *  - +10%: tarefa de 100 pts credita 110;
 *  - cap +100%: bônus 60% + 50% soma 110% e é cortado a 100% — 100 pts creditam 200;
 *  - arredondamento: 15 pts × 1,1 = 16,5 vira 17 (Math.round);
 *  - prêmio negativo atravessa multiplicado (DEC-39 sem piso): −20 × 1,1 = −22;
 *  - idempotência: a segunda passada devolve 0 e a porta de passivas nem é lida (R11);
 *  - sem passiva equipada, o caminho é o base de sempre.
 */
import { describe, expect, it } from "vitest";

import type { BadgeEffect, UserBadge } from "@/backend/domain";
import type { GamificationAwardHistoryPort, AwardLookup, AwardRecord } from "@/backend/modules/gamification/application/ports/gamification-award-history.port";
import type { EquippedPassivesPort } from "@/backend/modules/gamification/application/ports/equipped-passives.port";
import type { GamificationUsersPort, GamificationUserRecord } from "@/backend/modules/gamification/application/ports/gamification-users.port";
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port";
import type { UserStatsPort } from "@/backend/modules/gamification/application/ports/user-stats.port";
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port";
import { EvaluateUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case";
import { GetUserProgressionUseCase } from "@/backend/modules/gamification/application/use-cases/get-user-progression.use-case";
import { AwardFromTaskCompletionUseCase } from "@/backend/modules/gamification/application/use-cases/award-from-task-completion.use-case";

function makeUseCase(effects: BadgeEffect[], alreadyAwarded = false) {
  const writes: Array<{ pointsAwarded: number; description: string }> = [];
  const awardHistory: GamificationAwardHistoryPort = {
    async hasAward(_lookup: AwardLookup) {
      return alreadyAwarded;
    },
    async awardAndRecord(data: AwardRecord) {
      writes.push({ pointsAwarded: data.pointsAwarded, description: data.description });
    },
    async reverseTaskAward() {
      throw new Error("reverseTaskAward não deveria ser usada neste teste");
    },
  } as unknown as GamificationAwardHistoryPort;

  const users: GamificationUsersPort = {
    async findUserById(userId: number) {
      return { id: userId, points: 0, completedTasks: 0, weekHours: 0, roles: [] } as GamificationUserRecord;
    },
    async findAllUsers() {
      return [];
    },
    async findProgressionById(userId: number) {
      return { id: userId, points: 0 } as GamificationUserRecord;
    },
    async findMonthPointsById(userId: number) {
      return { id: userId, points: 0, currentMonthPoints: 0, weekHours: 0, roles: [], completedTasks: 0 } as GamificationUserRecord;
    },
    async adjustMonthPoints() {
      throw new Error("adjustMonthPoints não deveria ser usada neste teste");
    },
    async updateProgress() {
      throw new Error("updateProgress não deveria ser usada neste teste");
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
  const emptyUserBadges: UserBadgePort = { async findByUserId() { return [] as UserBadge[]; } } as unknown as UserBadgePort;
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
    useCase: new AwardFromTaskCompletionUseCase({ awardHistory, progression, evaluateUserBadges: evaluate, passives }),
    writes,
    passives,
  };
}

describe("AwardFromTaskCompletionUseCase com passiva equipada", () => {
  it("sem passiva: 100 pts creditam 100", async () => {
    const { useCase, writes } = makeUseCase([]);
    const result = await useCase.execute({ userId: 1, taskId: 77, taskPoints: 100 });
    expect(result.pointsAwarded).toBe(100);
    expect(writes[0].pointsAwarded).toBe(100);
  });

  it("+10% equipada: 100 pts creditam 110", async () => {
    const { useCase, writes } = makeUseCase([{ kind: "bonus", pct: 0.1 }]);
    const result = await useCase.execute({ userId: 1, taskId: 78, taskPoints: 100 });
    expect(result.pointsAwarded).toBe(110);
    expect(writes[0].pointsAwarded).toBe(110);
    expect(result.xpAwarded).toBe(110);
  });

  it("cap +100%: bônus 60% + 50% é cortado a 100% — 100 pts creditam 200", async () => {
    const { useCase } = makeUseCase([{ kind: "bonus", pct: 0.6 }, { kind: "bonus", pct: 0.5 }]);
    const result = await useCase.execute({ userId: 1, taskId: 79, taskPoints: 100 });
    expect(result.pointsAwarded).toBe(200);
  });

  it("Math.round congela o meio: 15 pts × 1,1 = 16,5 viram 17", async () => {
    const { useCase } = makeUseCase([{ kind: "bonus", pct: 0.1 }]);
    const result = await useCase.execute({ userId: 1, taskId: 80, taskPoints: 15 });
    expect(result.pointsAwarded).toBe(17);
  });

  it("prêmio negativo multiplicado: −20 × 1,1 = −22, sem piso na tarefa (DEC-39)", async () => {
    const { useCase } = makeUseCase([{ kind: "bonus", pct: 0.1 }]);
    const result = await useCase.execute({ userId: 1, taskId: 81, taskPoints: -20 });
    expect(result.pointsAwarded).toBe(-22);
  });

  it("idempotência (R11): segunda passada devolve 0 e a porta de passivas não é lida", async () => {
    const { useCase, writes, passives } = makeUseCase([{ kind: "bonus", pct: 0.1 }], true);
    const result = await useCase.execute({ userId: 1, taskId: 82, taskPoints: 100 });
    expect(result.pointsAwarded).toBe(0);
    expect(result.alreadyAwarded).toBe(true);
    expect(writes).toHaveLength(0);
    expect(passives.reads).toBe(0);
  });
});
