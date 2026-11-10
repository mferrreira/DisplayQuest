/**
 * plan-v15 S01 (MODELO R1/R2/R4, CA1) — o motor v2 sobre o registro de métricas.
 *
 * O que este arquivo trava:
 *  - `selectBadgesToAward` despacha pelo formato do criteria: v2 cai no motor de cláusulas,
 *    formato legado cai no caminho golden (`badgeCriteriaMet`), sem alterar o golden;
 *  - métrica fora do registro, cláusula vazia e múltiplas cláusulas com uma não atingida
 *    nunca concedem;
 *  - `EvaluateUserBadgesUseCase` alimenta o motor v2 com as métricas das portas e concede no
 *    gatilho, no mesmo padrão de concessão (earnedBy null, falha engolida).
 */
import { describe, expect, it } from "vitest";

import { selectBadgesToAward } from "@/backend/domain";
import type { Badge, UserBadge } from "@/backend/domain";
import { EvaluateUserBadgesUseCase } from "@/backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case";
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port";
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port";
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port";
import type { BadgeMetricsPort } from "@/backend/modules/gamification/application/ports/badge-metrics.port";
import type { UserStatsPort } from "@/backend/modules/gamification/application/ports/user-stats.port";

const v2Badge = (id: number, clauses: Array<{ metric: string; op: ">="; value: number }>): Badge => ({
  id,
  name: `B${id}`,
  description: "d",
  category: "achievement",
  criteria: { version: 2, clauses },
  isActive: true,
  createdBy: 1,
});

function legacyContext(overrides: Partial<{ stats: Record<string, number> }> = {}) {
  return {
    userId: 1,
    stats: {
      points: 0,
      completedTasks: 0,
      projectsCount: 0,
      workSessionsCount: 0,
      averageWeeklyHours: 0,
      maxConsecutiveDays: 0,
      ...overrides.stats,
    },
    roles: [] as string[],
    weekHours: 0,
    allUsers: [] as Array<{ id: number; points: number; completedTasks: number }>,
  };
}

describe("selectBadgesToAward com criteria v2", () => {
  it("concede quando todas as cláusulas v2 são atingidas", () => {
    const selected = selectBadgesToAward({
      badges: [v2Badge(1, [{ metric: "tasks_completed", op: ">=", value: 5 }])],
      earnedBadgeIds: [],
      metricValues: { tasks_completed: 5 },
      ...legacyContext(),
    });
    expect(selected.map((b) => b.id)).toEqual([1]);
  });

  it("múltiplas cláusulas: uma não atingida não concede", () => {
    const selected = selectBadgesToAward({
      badges: [v2Badge(2, [{ metric: "tasks_completed", op: ">=", value: 5 }, { metric: "points", op: ">=", value: 100 }])],
      earnedBadgeIds: [],
      metricValues: { tasks_completed: 10, points: 50 },
      ...legacyContext(),
    });
    expect(selected).toHaveLength(0);
  });

  it("métrica fora do registro nunca concede", () => {
    const selected = selectBadgesToAward({
      badges: [v2Badge(3, [{ metric: "coordenador", op: ">=", value: 1 }])],
      earnedBadgeIds: [],
      metricValues: { tasks_completed: 999 },
      ...legacyContext(),
    });
    expect(selected).toHaveLength(0);
  });

  it("cláusula vazia nunca concede", () => {
    const selected = selectBadgesToAward({
      badges: [v2Badge(4, [])],
      earnedBadgeIds: [],
      metricValues: { tasks_completed: 999 },
      ...legacyContext(),
    });
    expect(selected).toHaveLength(0);
  });

  it("criteria legado continua no caminho golden", () => {
    const legacy: Badge = {
      id: 5,
      name: "L5",
      description: "d",
      category: "achievement",
      criteria: { points: 10 },
      isActive: true,
      createdBy: 1,
    };
    const selected = selectBadgesToAward({
      badges: [legacy],
      earnedBadgeIds: [],
      metricValues: { tasks_completed: 999 },
      ...legacyContext({ stats: { points: 50 } }),
    });
    expect(selected.map((b) => b.id)).toEqual([5]);
  });
});

function makeDeps() {
  const users = {
    data: { id: 1, points: 0, completedTasks: 0, weekHours: 0, roles: [] as string[] },
    async findUserById(userId: number) {
      if (users.data.id !== userId) return null;
      return { ...users.data };
    },
    async findAllUsers() {
      return [];
    },
  } as unknown as GamificationUsersPort & { data: { id: number; points: number; completedTasks: number; weekHours: number; roles: string[] } };
  const badges = {
    store: [] as Badge[],
    async findActive() {
      return badges.store.filter((b) => b.isActive);
    },
  } as unknown as BadgeCatalogPort & { store: Badge[] };
  const userBadges = {
    store: [] as UserBadge[],
    async findByUserId(userId: number) {
      return userBadges.store.filter((ub) => ub.userId === userId);
    },
    async create(data: { userId: number; badgeId: number; earnedBy: number | null }) {
      const row = { id: userBadges.store.length + 1, earnedAt: new Date(), ...data };
      userBadges.store.push(row);
      return row;
    },
  } as unknown as UserBadgePort & { store: UserBadge[] };
  const stats = {
    projects: 0,
    sessions: 0,
    weekly: [] as Array<{ totalHours: number }>,
    daily: [] as Date[],
    async projectsCount() {
      return stats.projects;
    },
    async workSessionsCount() {
      return stats.sessions;
    },
    async weeklyHoursSamples() {
      return stats.weekly;
    },
    async dailyLogDates() {
      return stats.daily;
    },
  } as unknown as UserStatsPort & { projects: number; sessions: number; weekly: Array<{ totalHours: number }>; daily: Date[] };
  const metrics = {
    values: {} as Partial<Record<string, number>>,
    calledIds: [] as string[],
    async computeValues(_userId: number, ids: string[]) {
      metrics.calledIds.push(...ids);
      const out: Partial<Record<string, number>> = {};
      for (const id of ids) {
        if (id in metrics.values) out[id] = metrics.values[id];
      }
      return out;
    },
  } as unknown as BadgeMetricsPort & { values: Partial<Record<string, number>>; calledIds: string[] };
  return { users, badges, userBadges, stats, metrics };
}

describe("EvaluateUserBadgesUseCase com criteria v2", () => {
  it("concede o badge v2 do seed quando as tarefas completam o piso", async () => {
    const deps = makeDeps();
    deps.users.data.completedTasks = 5;
    deps.badges.store.push(v2Badge(10, [{ metric: "tasks_completed", op: ">=", value: 5 }]));

    const useCase = new EvaluateUserBadgesUseCase(deps);
    const awarded = await useCase.execute(1);

    expect(awarded.map((b) => b.id)).toEqual([10]);
    expect(deps.userBadges.store).toHaveLength(1);
    expect(deps.userBadges.store[0]).toMatchObject({ userId: 1, badgeId: 10, earnedBy: null });
  });

  it("concede pela média semanal em cláusula v2", async () => {
    const deps = makeDeps();
    deps.stats.weekly = [{ totalHours: 10 }, { totalHours: 10 }, { totalHours: 10 }, { totalHours: 6 }];
    deps.badges.store.push(v2Badge(11, [{ metric: "weekly_hours_avg", op: ">=", value: 8 }]));

    const useCase = new EvaluateUserBadgesUseCase(deps);
    const awarded = await useCase.execute(1);

    expect(awarded.map((b) => b.id)).toEqual([11]); // média 9 >= 8
  });

  it("métrica v2 sem valor medido não concede", async () => {
    const deps = makeDeps();
    deps.badges.store.push(v2Badge(12, [{ metric: "streak_days", op: ">=", value: 7 }]));

    const useCase = new EvaluateUserBadgesUseCase(deps);
    const awarded = await useCase.execute(1);

    expect(awarded).toHaveLength(0);
    expect(deps.userBadges.store).toHaveLength(0);
  });

  it("badge v2 já conquistado não é reconcedido", async () => {
    const deps = makeDeps();
    deps.users.data.completedTasks = 10;
    deps.badges.store.push(v2Badge(13, [{ metric: "tasks_completed", op: ">=", value: 5 }]));
    deps.userBadges.store.push({ id: 1, userId: 1, badgeId: 13, earnedAt: new Date(), earnedBy: null });

    const useCase = new EvaluateUserBadgesUseCase(deps);
    const awarded = await useCase.execute(1);

    expect(awarded).toHaveLength(0);
    expect(deps.userBadges.store).toHaveLength(1);
  });

  it("métrica extra do registro é medida pela porta e concede o badge", async () => {
    const deps = makeDeps();
    deps.metrics.values.sessions_hours_total = 10;
    deps.badges.store.push(v2Badge(14, [{ metric: "sessions_hours_total", op: ">=", value: 10 }]));

    const useCase = new EvaluateUserBadgesUseCase(deps);
    const awarded = await useCase.execute(1);

    expect(awarded.map((b) => b.id)).toEqual([14]);
    expect(deps.metrics.calledIds).toEqual(["sessions_hours_total"]);
  });

  it("criteria só com métricas base não toca a porta de métricas", async () => {
    const deps = makeDeps();
    deps.users.data.completedTasks = 5;
    deps.badges.store.push(v2Badge(15, [{ metric: "tasks_completed", op: ">=", value: 5 }]));

    const useCase = new EvaluateUserBadgesUseCase(deps);
    await useCase.execute(1);

    expect(deps.metrics.calledIds).toEqual([]);
  });
});
