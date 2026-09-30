/**
 * OND6-B1 — GOLDEN da gamificação (PLAN ONDA 6: "Golden dos engines e do gateway
 * (award por task/sessao, progression)").
 *
 * Congela o comportamento OBSERVÁVEL de:
 *   - PrismaGamificationGateway (award/idempotencia/progression/elo/level/history)
 *   - BadgeEngine (validacoes de badge, award/remocao de user-badge)
 *   - BadgeRulesEngine (criterios numericos + specialCondition)
 *
 * Seam: fake prisma via vi.mock("@/lib/database/prisma") (TDZ: criado em
 * vi.hoisted) + seam de construtor do BadgeEngine (repos fake injetados).
 *
 * QUIRK-6A (pinado, nao corrigido aqui): BadgeRulesEngine.evaluateUserForBadges
 * chama userBadgeRepo.create({userId,badgeId,earnedBy} as any) — objeto plain sem
 * .toPrisma() -> TypeError engolido pelo try/catch (console.error). Consequencia:
 * badge AUTOMATICO nunca e concedido no caminho de regras; so o caminho manual
 * (BadgeEngine.awardBadgeToUser, que usa UserBadge.create) funciona.
 * QUIRK-6B: Badge.create forca isActive=true mesmo com isActive:false no input.
 * QUIRK-6C: evaluateSpecialCondition — branches "coordenador"/"gerente" sem o role
 * caem no default return true; condicao desconhecida => true.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const world = {
    users: [] as any[],
    badges: [] as any[],
    userBadges: [] as any[],
    history: [] as any[],
    projectMembers: [] as any[],
    workSessions: [] as any[],
    weeklyHours: [] as any[],
    dailyLogs: [] as any[],
    seq: { badge: 1, userBadge: 1, history: 1 },
  };

  const reset = () => {
    world.users = [];
    world.badges = [];
    world.userBadges = [];
    world.history = [];
    world.projectMembers = [];
    world.workSessions = [];
    world.weeklyHours = [];
    world.dailyLogs = [];
    world.seq = { badge: 1, userBadge: 1, history: 1 };
  };

  // Prisma.JsonNull / Prisma.AnyNull: sentinels de objeto vazio com
  // constructor.name === "JsonNull" | "AnyNull" (verificado empiricamente).
  const isNullSentinel = (v: unknown): boolean =>
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v).length === 0 &&
    typeof (v as any).constructor?.name === "string" &&
    /^(Json|Any)Null$/.test((v as any).constructor.name);

  const normalizeJson = (v: unknown) => (isNullSentinel(v) ? null : v ?? null);
  const clone = (v: any) => (v == null ? v : structuredClone(v));

  const notFound = (model: string, id: unknown) => {
    const err = new Error(`Record not found: ${model} ${String(id)}`);
    (err as any).code = "P2025";
    return err;
  };

  const fake: any = {
    users: {
      async findUnique({ where, select }: any) {
        const row = world.users.find((u) => u.id === where.id);
        if (!row) return null;
        if (select) {
          const out: any = {};
          for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
          return out;
        }
        return clone(row);
      },
      async findMany({ where }: any) {
        let rows = [...world.users];
        if (where?.status !== undefined) rows = rows.filter((u) => u.status === where.status);
        if (where?.roles?.has !== undefined) rows = rows.filter((u) => u.roles.includes(where.roles.has));
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows.map(clone);
      },
      async update({ where, data }: any) {
        const row = world.users.find((u) => u.id === where.id);
        if (!row) throw notFound("users", where.id);
        for (const [k, v] of Object.entries(data as any)) {
          if (v && typeof v === "object" && "increment" in (v as any)) {
            row[k] = (row[k] ?? 0) + (v as any).increment;
          } else {
            row[k] = v;
          }
        }
        return clone(row);
      },
    },
    badges: {
      async findUnique({ where }: any) {
        const row = world.badges.find((b) => b.id === where.id);
        return row ? clone(row) : null;
      },
      async findMany({ where }: any) {
        let rows = [...world.badges];
        if (where) {
          if (where.isActive !== undefined) rows = rows.filter((b) => b.isActive === where.isActive);
          if (where.category !== undefined) rows = rows.filter((b) => b.category === where.category);
          if (where.createdBy !== undefined) rows = rows.filter((b) => b.createdBy === where.createdBy);
        }
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows.map(clone);
      },
      async create({ data }: any) {
        const row = {
          id: data.id ?? world.seq.badge++,
          name: data.name,
          description: data.description,
          icon: data.icon ?? null,
          color: data.color ?? null,
          category: data.category,
          criteria: normalizeJson(data.criteria),
          isActive: data.isActive ?? true,
          createdBy: data.createdBy,
          createdAt: data.createdAt ?? new Date(),
        };
        world.badges.push(row);
        return clone(row);
      },
      async update({ where, data }: any) {
        const row = world.badges.find((b) => b.id === where.id);
        if (!row) throw notFound("badges", where.id);
        for (const k of ["name", "description", "icon", "color", "category", "criteria", "isActive", "createdBy"]) {
          if (data[k] !== undefined) row[k] = k === "criteria" ? normalizeJson(data[k]) : data[k];
        }
        return clone(row);
      },
      async delete({ where }: any) {
        const idx = world.badges.findIndex((b) => b.id === where.id);
        if (idx === -1) throw notFound("badges", where.id);
        world.badges.splice(idx, 1);
      },
    },
    user_badges: {
      async findMany({ where, take }: any) {
        let rows = [...world.userBadges];
        if (where) {
          if (where.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId);
          if (where.badgeId !== undefined) rows = rows.filter((r) => r.badgeId === where.badgeId);
          if ("earnedBy" in where) {
            if (where.earnedBy === null) rows = rows.filter((r) => r.earnedBy == null);
            else if (where.earnedBy?.not !== undefined) rows = rows.filter((r) => r.earnedBy != null);
          }
        }
        rows.sort((a, b) => b.earnedAt.getTime() - a.earnedAt.getTime());
        if (take !== undefined) rows = rows.slice(0, take);
        return rows.map(clone);
      },
      async findUnique({ where }: any) {
        const c = where.userId_badgeId;
        const row = world.userBadges.find((r) => r.userId === c.userId && r.badgeId === c.badgeId);
        return row ? clone(row) : null;
      },
      async create({ data }: any) {
        const row = {
          id: data.id ?? world.seq.userBadge++,
          userId: data.userId,
          badgeId: data.badgeId,
          earnedAt: data.earnedAt ?? new Date(),
          earnedBy: data.earnedBy ?? null,
        };
        world.userBadges.push(row);
        return clone(row);
      },
      async delete({ where }: any) {
        let idx: number;
        if (where.userId_badgeId) {
          const c = where.userId_badgeId;
          idx = world.userBadges.findIndex((r) => r.userId === c.userId && r.badgeId === c.badgeId);
        } else {
          idx = world.userBadges.findIndex((r) => r.id === where.id);
        }
        if (idx === -1) throw notFound("user_badges", JSON.stringify(where));
        world.userBadges.splice(idx, 1);
      },
      async count({ where }: any) {
        let rows = [...world.userBadges];
        if (where?.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId);
        return rows.length;
      },
    },
    history: {
      async findFirst({ where }: any) {
        const row = world.history.find(
          (r) =>
            r.entityType === where.entityType &&
            r.entityId === where.entityId &&
            r.action === where.action &&
            (where.description === undefined || r.description === where.description),
        );
        return row ? clone(row) : null;
      },
      async create({ data }: any) {
        const row = {
          id: world.seq.history++,
          entityType: data.entityType,
          entityId: data.entityId,
          action: data.action,
          performedBy: data.performedBy,
          description: data.description,
          oldValues: normalizeJson(data.oldValues),
          newValues: clone(data.newValues ?? null),
          metadata: clone(data.metadata ?? null),
          createdAt: new Date(),
        };
        world.history.push(row);
        return clone(row);
      },
    },
    project_members: {
      async count({ where }: any) {
        let rows = [...world.projectMembers];
        if (where?.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId);
        return rows.length;
      },
    },
    work_sessions: {
      async count({ where }: any) {
        let rows = [...world.workSessions];
        if (where?.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId);
        return rows.length;
      },
    },
    weekly_hours_history: {
      async findMany({ where, take }: any) {
        let rows = [...world.weeklyHours];
        if (where?.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId);
        rows.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
        if (take !== undefined) rows = rows.slice(0, take);
        return rows.map(clone);
      },
    },
    daily_logs: {
      async findMany({ where }: any) {
        let rows = [...world.dailyLogs];
        if (where?.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId);
        rows.sort((a, b) => a.date.getTime() - b.date.getTime());
        return rows.map(clone);
      },
    },
    async $transaction(fn: any) {
      return fn(fake);
    },
  };

  return { world, prisma: fake, reset };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: h.prisma }));

import { PrismaGamificationGateway } from "@/backend/modules/gamification/infrastructure/prisma-gamification.gateway";
import { BadgeEngine } from "@/backend/modules/gamification/infrastructure/legacy-engines/badge.engine";
import { BadgeRulesEngine } from "@/backend/modules/gamification/infrastructure/legacy-engines/badge-rules.engine";
import { Badge, UserBadge } from "@/backend/models/Badge";
import type { BadgeRepository, UserBadgeRepository } from "@/backend/repositories/BadgeRepository";

const FROZEN = new Date("2026-09-01T12:00:00.000Z");

function seedUser(o: {
  id: number;
  points?: number;
  completedTasks?: number;
  weekHours?: number;
  roles?: string[];
  status?: string;
  createdAt?: Date;
}) {
  h.world.users.push({
    id: o.id,
    name: `User ${o.id}`,
    email: `u${o.id}@dq.test`,
    password: "hashed",
    status: o.status ?? "active",
    points: o.points ?? 0,
    completedTasks: o.completedTasks ?? 0,
    weekHours: o.weekHours ?? 0,
    currentWeekHours: 0,
    profileVisibility: "public",
    bio: null,
    avatar: null,
    roles: o.roles ?? [],
    createdAt: o.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
  });
}

async function seedBadge(o: {
  id?: number;
  name?: string;
  category?: string;
  criteria?: any;
  isActive?: boolean;
  createdAt?: Date;
  createdBy?: number;
}) {
  const created = await h.prisma.badges.create({
    data: {
      id: o.id,
      name: o.name ?? `Badge ${o.id ?? "auto"}`,
      description: "desc",
      icon: null,
      color: null,
      category: o.category ?? "achievement",
      criteria: o.criteria ?? null,
      isActive: o.isActive ?? true,
      createdBy: o.createdBy ?? 1,
      createdAt: o.createdAt,
    },
  });
  return created;
}

async function seedUserBadge(userId: number, badgeId: number, earnedBy: number | null = null) {
  return await h.prisma.user_badges.create({ data: { userId, badgeId, earnedBy } });
}

let gateway: PrismaGamificationGateway;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.reset();
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  gateway = new PrismaGamificationGateway();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// PrismaGamificationGateway — awardFromWorkSession
// ---------------------------------------------------------------------------

describe("golden: PrismaGamificationGateway.awardFromWorkSession", () => {
  it.each([
    ["durationSeconds undefined", undefined, null as number | null | undefined, 10],
    ["durationSeconds null", null, null, 10],
    ["duration 0s", 0, null, 10],
    ["duration 1800s (0.5h -> +5)", 1800, null, 15],
    ["duration 3599s (floor, nao round)", 3599, null, 19],
    ["duration 7200s (2h -> +20)", 7200, null, 30],
    ["duration 14400s (4h -> +40 teto exato)", 14400, null, 50],
    ["duration 72000s (20h -> bonus teto 40)", 72000, null, 50],
    ["duration negativo -> clamp 0", -3600, null, 10],
    ["3 tarefas -> +15", null, [1, 2, 3], 25],
    ["10 tarefas -> bonus teto 30", null, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 40],
    ["2h + 4 tarefas -> 10+20+20", 7200, [1, 2, 3, 4], 50],
  ] as const)("pontos: %s => %i", async (_label, durationSeconds, completedTaskIds, expected) => {
    seedUser({ id: 1 });
    const result = await gateway.awardFromWorkSession({
      userId: 1,
      workSessionId: 42,
      durationSeconds: durationSeconds as number | null | undefined,
      completedTaskIds: completedTaskIds as number[] | undefined,
    });
    expect(result.pointsAwarded).toBe(expected);
    expect(result.xpAwarded).toBe(expected); // xp == points (identidade)
    expect(result.alreadyAwarded).toBe(false);
    expect(result.sourceType).toBe("WORK_SESSION_COMPLETED");
    expect(result.sourceId).toBe(42);
    expect(result.newProgression.points).toBe(expected);
  });

  it("e idempotente por (userId, workSessionId): segunda chamada nao incrementa nem duplica history", async () => {
    seedUser({ id: 1 });
    const first = await gateway.awardFromWorkSession({ userId: 1, workSessionId: 42, durationSeconds: 7200 });
    const second = await gateway.awardFromWorkSession({ userId: 1, workSessionId: 42, durationSeconds: 7200 });

    expect(first.pointsAwarded).toBe(30);
    expect(second.alreadyAwarded).toBe(true);
    expect(second.pointsAwarded).toBe(0);
    expect(second.xpAwarded).toBe(0);
    expect(second.newProgression.points).toBe(30); // progressao corrente, nao zerada
    expect(h.world.users[0].points).toBe(30);
    expect(h.world.history).toHaveLength(1);
  });

  it("grava history com descricao GAMIFICATION:<sourceType>:<sourceId> e payloads newValues/metadata", async () => {
    seedUser({ id: 7 });
    await gateway.awardFromWorkSession({ userId: 7, workSessionId: 42, durationSeconds: 3600, completedTaskIds: [5] });

    expect(h.world.history).toHaveLength(1);
    const row = h.world.history[0];
    expect(row.entityType).toBe("USER");
    expect(row.entityId).toBe(7);
    expect(row.action).toBe("GAMIFICATION_AWARD");
    expect(row.performedBy).toBe(7);
    expect(row.description).toBe("GAMIFICATION:WORK_SESSION_COMPLETED:42");
    expect(row.oldValues).toBeNull();
    expect(row.newValues).toEqual({
      sourceType: "WORK_SESSION_COMPLETED",
      sourceId: 42,
      pointsAwarded: 25, // 10 + floor(1h*10)=10 + 1 tarefa*5=5
      xpAwarded: 25,
    });
    expect(row.metadata).toEqual({
      domain: "gamification",
      sourceType: "WORK_SESSION_COMPLETED",
      sourceId: 42,
      pointsAwarded: 25,
      xpAwarded: 25,
    });
  });

  it("dedupe por DESCRICAO: workSession 42 e task 42 sao fontes distintas e ambos concedem", async () => {
    seedUser({ id: 1 });
    const ws = await gateway.awardFromWorkSession({ userId: 1, workSessionId: 42 });
    const task = await gateway.awardFromTaskCompletion({ userId: 1, taskId: 42 });
    expect(ws.alreadyAwarded).toBe(false);
    expect(task.alreadyAwarded).toBe(false);
    expect(h.world.users[0].points).toBe(20); // 10 + 10
  });

  it("dispara avaliacao de badges APOs o credit (QUIRK-6A: create plain-object falha e e engolido)", async () => {
    seedUser({ id: 1 });
    await seedBadge({ id: 3, criteria: { points: 20 } });

    const result = await gateway.awardFromWorkSession({ userId: 1, workSessionId: 42, durationSeconds: 7200 });

    expect(result.pointsAwarded).toBe(30);
    // points ja incrementado (30 >= 20) quando as regras rodam -> tentativa de concessao
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(String(consoleErrorSpy.mock.calls[0][0])).toBe("Error awarding badge 3 to user 1:");
    expect(h.world.userBadges).toHaveLength(0); // QUIRK-6A: nunca concede
  });

  it("falha para usuario inexistente sem deixar history nem pontos", async () => {
    await expect(gateway.awardFromWorkSession({ userId: 999, workSessionId: 1 })).rejects.toThrow();
    expect(h.world.history).toHaveLength(0);
    expect(h.world.users).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PrismaGamificationGateway — awardFromTaskCompletion
// ---------------------------------------------------------------------------

describe("golden: PrismaGamificationGateway.awardFromTaskCompletion", () => {
  it("taskPoints undefined => default 10", async () => {
    seedUser({ id: 1 });
    const r = await gateway.awardFromTaskCompletion({ userId: 1, taskId: 9 });
    expect(r.pointsAwarded).toBe(10);
    expect(r.sourceType).toBe("TASK_COMPLETED");
  });

  it("taskPoints null => default 10", async () => {
    seedUser({ id: 1 });
    // GAP-04 (fecha em OND6-B2): o contrato declara taskPoints?: number, mas o
    // gateway trata null em runtime — o tipo correto seria number | null.
    const r = await gateway.awardFromTaskCompletion({ userId: 1, taskId: 9, taskPoints: null as any });
    expect(r.pointsAwarded).toBe(10);
  });

  it("taskPoints fracionado => Math.floor (15.7 -> 15)", async () => {
    seedUser({ id: 1 });
    const r = await gateway.awardFromTaskCompletion({ userId: 1, taskId: 9, taskPoints: 15.7 });
    expect(r.pointsAwarded).toBe(15);
  });

  it("taskPoints 0 => 0 (QUIRK: sem clamp minimo 1, ao contrario do caminho de sessao)", async () => {
    seedUser({ id: 1, points: 100 });
    const r = await gateway.awardFromTaskCompletion({ userId: 1, taskId: 9, taskPoints: 0 });
    expect(r.pointsAwarded).toBe(0);
    expect(r.alreadyAwarded).toBe(false);
    expect(h.world.users[0].points).toBe(100);
    expect(h.world.history).toHaveLength(1); // award "vazio" ainda loga
  });

  it("taskPoints negativo => decrementa pontos (Math.floor(-5) = -5)", async () => {
    seedUser({ id: 1, points: 100 });
    const r = await gateway.awardFromTaskCompletion({ userId: 1, taskId: 9, taskPoints: -5 });
    expect(r.pointsAwarded).toBe(-5);
    expect(h.world.users[0].points).toBe(95);
  });

  it("e idempotente por (userId, taskId)", async () => {
    seedUser({ id: 1 });
    await gateway.awardFromTaskCompletion({ userId: 1, taskId: 9, taskPoints: 20 });
    const second = await gateway.awardFromTaskCompletion({ userId: 1, taskId: 9, taskPoints: 20 });
    expect(second.alreadyAwarded).toBe(true);
    expect(second.pointsAwarded).toBe(0);
    expect(h.world.history).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// PrismaGamificationGateway — getUserProgression (level/elo/progress)
// ---------------------------------------------------------------------------

describe("golden: PrismaGamificationGateway.getUserProgression", () => {
  it("lanca 'Usuário não encontrado' para usuario inexistente", async () => {
    await expect(gateway.getUserProgression(999)).rejects.toThrow("Usuário não encontrado");
  });

  it("pontos negativos: xp clampado a 0 mas points reportado cru", async () => {
    seedUser({ id: 1, points: -50 });
    const p = await gateway.getUserProgression(1);
    expect(p.points).toBe(-50);
    expect(p.xp).toBe(0);
    expect(p.level).toBe(0);
    expect(p.nextLevelXp).toBe(100);
    expect(p.progressToNextLevel).toBe(0);
    expect(p.elo).toBe("BRONZE");
  });

  it("level = floor(xp/100), nextLevelXp = (level+1)*100, progress = xp%100", async () => {
    seedUser({ id: 1, points: 250 });
    const p = await gateway.getUserProgression(1);
    expect(p.level).toBe(2);
    expect(p.nextLevelXp).toBe(300);
    expect(p.progressToNextLevel).toBe(50);
  });

  it("fronteira exata de level: xp 100 => level 1 progress 0; xp 199 => progress 99", async () => {
    seedUser({ id: 1, points: 100 });
    const at = await gateway.getUserProgression(1);
    expect(at.level).toBe(1);
    expect(at.progressToNextLevel).toBe(0);

    seedUser({ id: 2, points: 199 });
    const near = await gateway.getUserProgression(2);
    expect(near.level).toBe(1);
    expect(near.progressToNextLevel).toBe(99);
  });

  it.each([
    [0, "BRONZE"],
    [699, "BRONZE"],
    [700, "PRATA"],
    [1499, "PRATA"],
    [1500, "OURO"],
    [2499, "OURO"],
    [2500, "DIAMANTE"],
    [9999, "DIAMANTE"],
  ] as const)("elo por faixa de xp: %i => %s", async (points, elo) => {
    seedUser({ id: 1, points });
    const p = await gateway.getUserProgression(1);
    expect(p.elo).toBe(elo);
  });
});

// ---------------------------------------------------------------------------
// PrismaGamificationGateway — delegacao badge CRUD/user-badges
// ---------------------------------------------------------------------------

describe("golden: PrismaGamificationGateway (delegacao de badges)", () => {
  it("listBadges ordena por createdAt DESC", async () => {
    await seedBadge({ id: 1, name: "velho", createdAt: new Date("2026-01-01T00:00:00Z") });
    await seedBadge({ id: 2, name: "novo", createdAt: new Date("2026-06-01T00:00:00Z") });
    const badges = await gateway.listBadges();
    expect(badges.map((b) => b.name)).toEqual(["novo", "velho"]);
  });

  it("getBadgeById retorna null para inexistente", async () => {
    expect(await gateway.getBadgeById(999)).toBeNull();
  });

  it("createBadge via gateway persiste e retorna Badge com id", async () => {
    const badge = await gateway.createBadge({
      name: "  Pioneiro  ",
      description: "  primeiro login  ",
      category: "milestone",
      createdBy: 1,
    });
    expect(badge.id).toBeDefined();
    expect(badge.name).toBe("Pioneiro"); // trim
    expect(badge.description).toBe("primeiro login");
    expect(badge.icon).toBeNull(); // engine passa data.icon || null
    expect(badge.isActive).toBe(true);
    expect(h.world.badges[0].name).toBe("Pioneiro");
  });

  it("updateBadge faz merge parcial e persiste", async () => {
    await seedBadge({ id: 1, name: "Original", criteria: { points: 10 } });
    const updated = await gateway.updateBadge({ id: 1, data: { name: "Renomeado", isActive: false } });
    expect(updated.name).toBe("Renomeado");
    expect(updated.isActive).toBe(false);
    expect(updated.criteria).toEqual({ points: 10 }); // preservado
    expect(h.world.badges[0].isActive).toBe(false);
  });

  it("deleteBadge remove a linha; inexistente lanca 'Badge não encontrado'", async () => {
    await seedBadge({ id: 1 });
    await gateway.deleteBadge(1);
    expect(h.world.badges).toHaveLength(0);
    await expect(gateway.deleteBadge(1)).rejects.toThrow("Badge não encontrado");
  });

  it("listUserBadges ordena por earnedAt DESC; listRecentUserBadges aplica limit", async () => {
    seedUser({ id: 1 });
    await seedBadge({ id: 10 });
    await seedBadge({ id: 11 });
    await seedBadge({ id: 12 });
    await h.prisma.user_badges.create({ data: { userId: 1, badgeId: 10, earnedAt: new Date("2026-01-01T00:00:00Z") } });
    await h.prisma.user_badges.create({ data: { userId: 1, badgeId: 11, earnedAt: new Date("2026-02-01T00:00:00Z") } });
    await h.prisma.user_badges.create({ data: { userId: 1, badgeId: 12, earnedAt: new Date("2026-03-01T00:00:00Z") } });

    const all = await gateway.listUserBadges(1);
    expect(all.map((b) => b.badgeId)).toEqual([12, 11, 10]);

    const recent = await gateway.listRecentUserBadges(1, 2);
    expect(recent.map((b) => b.badgeId)).toEqual([12, 11]);
  });

  it("awardBadge (manual) funciona e registra earnedBy; duplicado lanca 'Usuário já possui este badge'", async () => {
    seedUser({ id: 1 });
    await seedBadge({ id: 10 });
    const ub = await gateway.awardBadge({ badgeId: 10, userId: 1, awardedBy: 2 });
    expect(ub.userId).toBe(1);
    expect(ub.badgeId).toBe(10);
    expect(ub.earnedBy).toBe(2);

    await expect(gateway.awardBadge({ badgeId: 10, userId: 1 })).rejects.toThrow("Usuário já possui este badge");
  });

  it("awardBadge para badge inexistente lanca 'Badge não encontrado'", async () => {
    await expect(gateway.awardBadge({ badgeId: 999, userId: 1 })).rejects.toThrow("Badge não encontrado");
  });

  it("removeUserBadge remove; inexistente lanca 'Usuário não possui este badge'", async () => {
    await seedBadge({ id: 10 });
    await seedUserBadge(1, 10);
    await gateway.removeUserBadge(1, 10);
    expect(h.world.userBadges).toHaveLength(0);
    await expect(gateway.removeUserBadge(1, 10)).rejects.toThrow("Usuário não possui este badge");
  });

  it("evaluateUserBadges lanca 'Usuário não encontrado' para usuario inexistente", async () => {
    await expect(gateway.evaluateUserBadges(999)).rejects.toThrow("Usuário não encontrado");
  });
});

// ---------------------------------------------------------------------------
// BadgeEngine — via seam de construtor (repos fake injetados)
// ---------------------------------------------------------------------------

function makeEngineFakes() {
  const badges: Badge[] = [];
  const userBadges: UserBadge[] = [];
  let badgeSeq = 100;
  let userBadgeSeq = 200;

  const badgeRepo = {
    async findById(id: number) {
      return badges.find((b) => b.id === id) ?? null;
    },
    async findAll() {
      return [...badges];
    },
    async findByCategory(category: string) {
      return badges.filter((b) => b.category === category);
    },
    async findActive() {
      return badges.filter((b) => b.isActive);
    },
    async create(badge: Badge) {
      badge.id = badgeSeq++;
      badges.push(badge);
      return badge;
    },
    async update(badge: Badge) {
      const idx = badges.findIndex((b) => b.id === badge.id);
      if (idx === -1) throw new Error("Badge not found in fake repo");
      badges[idx] = badge;
      return badge;
    },
    async delete(id: number) {
      const idx = badges.findIndex((b) => b.id === id);
      if (idx !== -1) badges.splice(idx, 1);
    },
  } as unknown as BadgeRepository;

  const userBadgeRepo = {
    async findByUserId(userId: number) {
      return userBadges.filter((u) => u.userId === userId);
    },
    async findByUserAndBadge(userId: number, badgeId: number) {
      return userBadges.find((u) => u.userId === userId && u.badgeId === badgeId) ?? null;
    },
    async create(userBadge: UserBadge) {
      userBadge.id = userBadgeSeq++;
      userBadges.push(userBadge);
      return userBadge;
    },
    async delete(id: number) {
      const idx = userBadges.findIndex((u) => u.id === id);
      if (idx !== -1) userBadges.splice(idx, 1);
    },
    async findRecentByUserId(userId: number, limit = 10) {
      return userBadges.filter((u) => u.userId === userId).slice(0, limit);
    },
  } as unknown as UserBadgeRepository;

  return { engine: new BadgeEngine(badgeRepo, userBadgeRepo), badges, userBadges };
}

describe("golden: BadgeEngine (seam de construtor)", () => {
  it("create valida nome obrigatorio (ausente e em branco)", async () => {
    const { engine } = makeEngineFakes();
    await expect(engine.create({ description: "d", category: "achievement", createdBy: 1 })).rejects.toThrow(
      "Nome do badge é obrigatório",
    );
    await expect(engine.create({ name: "   ", description: "d", category: "achievement", createdBy: 1 })).rejects.toThrow(
      "Nome do badge é obrigatório",
    );
  });

  it("create valida descricao obrigatoria", async () => {
    const { engine } = makeEngineFakes();
    await expect(engine.create({ name: "n", description: "  ", category: "achievement", createdBy: 1 })).rejects.toThrow(
      "Descrição do badge é obrigatória",
    );
  });

  it("create valida categoria obrigatoria e categoria invalida", async () => {
    const { engine } = makeEngineFakes();
    await expect(engine.create({ name: "n", description: "d", createdBy: 1 })).rejects.toThrow(
      "Categoria do badge é obrigatória",
    );
    await expect(engine.create({ name: "n", description: "d", category: "bogus", createdBy: 1 })).rejects.toThrow(
      "Categoria de badge inválida",
    );
  });

  it("create valida criador obrigatorio (QUIRK: createdBy 0 e tratado como ausente)", async () => {
    const { engine } = makeEngineFakes();
    await expect(engine.create({ name: "n", description: "d", category: "social" })).rejects.toThrow(
      "Criador do badge é obrigatório",
    );
    await expect(
      engine.create({ name: "n", description: "d", category: "social", createdBy: 0 }),
    ).rejects.toThrow("Criador do badge é obrigatório");
  });

  it("create normaliza: trim, icon/color default null, criteria default null (QUIRK: Badge.create força isActive=true mesmo com isActive:false)", async () => {
    const { engine, badges } = makeEngineFakes();
    const badge = await engine.create({
      name: "  Herói  ",
      description: "  salva o dia  ",
      category: "special",
      icon: "hero.svg",
      criteria: { points: 50 },
      isActive: false,
      createdBy: 5,
    });
    expect(badge.name).toBe("Herói");
    expect(badge.description).toBe("salva o dia");
    expect(badge.icon).toBe("hero.svg");
    expect(badge.color).toBeNull();
    expect(badge.criteria).toEqual({ points: 50 });
    expect(badge.isActive).toBe(true); // QUIRK: Badge.create ignora isActive:false do input
    expect(badge.createdBy).toBe(5);
    expect(badges[0].id).toBe(100);
  });

  it("update lanca 'Badge não encontrado' para id inexistente", async () => {
    const { engine } = makeEngineFakes();
    await expect(engine.update(999, { name: "x" })).rejects.toThrow("Badge não encontrado");
  });

  it("update faz merge parcial; campos ausentes preservados; isActive coercido por Boolean()", async () => {
    const { engine, badges } = makeEngineFakes();
    badges.push(
      new Badge({
        id: 1,
        name: "Original",
        description: "desc",
        icon: "i.svg",
        color: "red",
        category: "milestone",
        criteria: { tasks: 3 },
        isActive: true,
        createdBy: 1,
      }),
    );
    const updated = await engine.update(1, { name: "Novo", isActive: 0 });
    expect(updated.name).toBe("Novo");
    expect(updated.description).toBe("desc");
    expect(updated.icon).toBe("i.svg");
    expect(updated.color).toBe("red");
    expect(updated.criteria).toEqual({ tasks: 3 });
    expect(updated.isActive).toBe(false); // Boolean(0) === false
  });

  it("update rejeita nome/descricao vazios quando presentes", async () => {
    const { engine, badges } = makeEngineFakes();
    badges.push(new Badge({ id: 1, name: "A", description: "d", category: "social", isActive: true, createdBy: 1 }));
    await expect(engine.update(1, { name: "" })).rejects.toThrow("Nome do badge é obrigatório");
    await expect(engine.update(1, { description: "   " })).rejects.toThrow("Descrição do badge é obrigatória");
  });

  it("update NAO revalida categoria (QUIRK: categoria bogus passa)", async () => {
    const { engine, badges } = makeEngineFakes();
    badges.push(new Badge({ id: 1, name: "A", description: "d", category: "social", isActive: true, createdBy: 1 }));
    const updated = await engine.update(1, { category: "bogus" });
    expect(updated.category).toBe("bogus");
  });

  it("delete lanca 'Badge não encontrado' para inexistente", async () => {
    const { engine } = makeEngineFakes();
    await expect(engine.delete(999)).rejects.toThrow("Badge não encontrado");
  });

  it("awardBadgeToUser: badge inexistente lanca 'Badge não encontrado'", async () => {
    const { engine } = makeEngineFakes();
    await expect(engine.awardBadgeToUser(999, 1)).rejects.toThrow("Badge não encontrado");
  });

  it("awardBadgeToUser: duplicado lanca 'Usuário já possui este badge'", async () => {
    const { engine, badges, userBadges } = makeEngineFakes();
    badges.push(new Badge({ id: 10, name: "A", description: "d", category: "social", isActive: true, createdBy: 1 }));
    userBadges.push(new UserBadge({ id: 1, userId: 1, badgeId: 10, earnedBy: null }));
    await expect(engine.awardBadgeToUser(10, 1)).rejects.toThrow("Usuário já possui este badge");
  });

  it("awardBadgeToUser: earnedBy = awardedBy || null (undefined => null)", async () => {
    const { engine, badges, userBadges } = makeEngineFakes();
    badges.push(new Badge({ id: 10, name: "A", description: "d", category: "social", isActive: true, createdBy: 1 }));
    const ub = await engine.awardBadgeToUser(10, 1);
    expect(ub.earnedBy).toBeNull();
    const ub2 = await engine.awardBadgeToUser(10, 2, 7);
    expect(ub2.earnedBy).toBe(7);
    expect(userBadges).toHaveLength(2);
  });

  it("removeBadgeFromUser: inexistente lanca 'Usuário não possui este badge'", async () => {
    const { engine } = makeEngineFakes();
    await expect(engine.removeBadgeFromUser(1, 10)).rejects.toThrow("Usuário não possui este badge");
  });
});

// ---------------------------------------------------------------------------
// BadgeRulesEngine — via gateway.evaluateUserBadges (fake prisma)
// ---------------------------------------------------------------------------

describe("golden: BadgeRulesEngine (criterios)", () => {
  // Helper: prepara user + badge e roda a avaliacao. Retorna quantas tentativas
  // de concessao houve (console.error "Error awarding badge" = criterio ATINGIDO,
  // pois o create do caminho de regras e quebrado — QUIRK-6A).
  async function evaluateWith(criteria: any, userOverrides: any = {}, badgeOverrides: any = {}) {
    // Chamadas multiplas no mesmo teste: remove user 1 / badge 3 anteriores para
    // nao duplicar (stats semeadas em world.* sao preservadas).
    h.world.users = h.world.users.filter((u) => u.id !== 1);
    h.world.badges = h.world.badges.filter((b) => b.id !== 3);
    seedUser({ id: 1, ...userOverrides });
    const badge = await seedBadge({ id: 3, criteria, ...badgeOverrides });
    const newlyEarned = await gateway.evaluateUserBadges(1);
    const attempts = consoleErrorSpy.mock.calls.filter((c: any[]) => String(c[0]).startsWith("Error awarding badge 3 to user 1:"));
    return { badge, newlyEarned, attempts };
  }

  it("badge sem criteria (manual) nunca e concedido automaticamente", async () => {
    const { newlyEarned, attempts } = await evaluateWith(null);
    expect(newlyEarned).toHaveLength(0);
    expect(attempts).toHaveLength(0);
    expect(h.world.userBadges).toHaveLength(0);
  });

  it("badge inativo nao e avaliado (findActive)", async () => {
    const { attempts } = await evaluateWith({ points: 1 }, { points: 100 }, { isActive: false });
    expect(attempts).toHaveLength(0);
  });

  it("criterio atingido => tentativa de concessao (QUIRK-6A: TypeError engolido, nada concedido)", async () => {
    const { newlyEarned, attempts } = await evaluateWith({ points: 20 }, { points: 20 });
    expect(attempts).toHaveLength(1);
    expect(newlyEarned).toHaveLength(0);
    expect(h.world.userBadges).toHaveLength(0);
  });

  it("criterio NAO atingido => nenhuma tentativa", async () => {
    const { attempts } = await evaluateWith({ points: 20 }, { points: 19 });
    expect(attempts).toHaveLength(0);
  });

  it("criterio tasks usa user.completedTasks", async () => {
    const met = await evaluateWith({ tasks: 5 }, { completedTasks: 5 });
    expect(met.attempts).toHaveLength(1);
    h.reset();
    consoleErrorSpy.mockClear();
    const notMet = await evaluateWith({ tasks: 5 }, { completedTasks: 4 });
    expect(notMet.attempts).toHaveLength(0);
  });

  it("criterio projects usa contagem de project_members", async () => {
    h.world.projectMembers.push({ userId: 1 }, { userId: 1 }, { userId: 2 });
    const { attempts } = await evaluateWith({ projects: 2 }, {});
    expect(attempts).toHaveLength(1);
  });

  it("criterio workSessions usa contagem de work_sessions", async () => {
    h.world.workSessions.push({ userId: 1 });
    const met = await evaluateWith({ workSessions: 1 }, {});
    expect(met.attempts).toHaveLength(1);
    h.world.workSessions = [];
    consoleErrorSpy.mockClear();
    const notMet = await evaluateWith({ workSessions: 1 }, {});
    expect(notMet.attempts).toHaveLength(0);
  });

  it("criterio weeklyHours usa MEDIA das ultimas 4 semanas (take 4, mais antiga fora)", async () => {
    const base = Date.UTC(2026, 0, 1);
    // take 4 pega as 4 MAIS NOVAS: 100,10,10,10 -> media 32.5; a outlier 1000 e a mais ANTIGA (fora)
    h.world.weeklyHours.push(
      { userId: 1, totalHours: 1000, weekStart: new Date(base) },
      { userId: 1, totalHours: 10, weekStart: new Date(base + 1 * 7 * 86400000) },
      { userId: 1, totalHours: 10, weekStart: new Date(base + 2 * 7 * 86400000) },
      { userId: 1, totalHours: 10, weekStart: new Date(base + 3 * 7 * 86400000) },
      { userId: 1, totalHours: 100, weekStart: new Date(base + 4 * 7 * 86400000) },
    );
    const met = await evaluateWith({ weeklyHours: 32 }, {});
    expect(met.attempts).toHaveLength(1);
    consoleErrorSpy.mockClear();
    const notMet = await evaluateWith({ weeklyHours: 33 }, {}); // 32.5 < 33 -> 1000 ignorada
    expect(notMet.attempts).toHaveLength(0);
  });

  it("criterio consecutiveDays usa streak maximo de daily_logs (gap reseta)", async () => {
    const d = (day: number) => new Date(Date.UTC(2026, 0, day));
    h.world.dailyLogs.push({ userId: 1, date: d(1) }, { userId: 1, date: d(2) }, { userId: 1, date: d(3) }, { userId: 1, date: d(10) });
    const met = await evaluateWith({ consecutiveDays: 3 }, {});
    expect(met.attempts).toHaveLength(1);
    consoleErrorSpy.mockClear();
    const notMet = await evaluateWith({ consecutiveDays: 4 }, {});
    expect(notMet.attempts).toHaveLength(0);
  });

  it("QUIRK: threshold falsy (0) e ignorado — badge com criteria {points: 0} e concedido a qualquer um", async () => {
    const { attempts } = await evaluateWith({ points: 0 }, { points: 0 });
    expect(attempts).toHaveLength(1);
  });

  it("multiplos criterios: TODOS precisam ser atingidos (AND)", async () => {
    const { attempts } = await evaluateWith({ points: 10, tasks: 5 }, { points: 100, completedTasks: 4 });
    expect(attempts).toHaveLength(0);
  });

  it("badge ja conquistado e pulado (sem nova tentativa)", async () => {
    seedUser({ id: 1, points: 100 });
    await seedBadge({ id: 3, criteria: { points: 20 } });
    await seedUserBadge(1, 3);
    const newlyEarned = await gateway.evaluateUserBadges(1);
    expect(newlyEarned).toHaveLength(0);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(h.world.userBadges).toHaveLength(1); // nao duplicou
  });

  it("specialCondition 'primeiro ... 100 tarefas': unico usuario >=100 => atingido; empate => nao", async () => {
    const met = await evaluateWith({ specialCondition: "primeiro a atingir 100 tarefas" }, { completedTasks: 100 });
    expect(met.attempts).toHaveLength(1);

    h.reset();
    consoleErrorSpy.mockClear();
    seedUser({ id: 2, completedTasks: 100 });
    const tie = await evaluateWith({ specialCondition: "primeiro a atingir 100 tarefas" }, { completedTasks: 100 });
    expect(tie.attempts).toHaveLength(0); // dois usuarios >=100 -> ninguem e "o primeiro"
  });

  it("specialCondition 'primeiro ... 100 pontos' usa points", async () => {
    const { attempts } = await evaluateWith({ specialCondition: "primeiro a ter 100 pontos" }, { points: 150 });
    expect(attempts).toHaveLength(1);
  });

  it("specialCondition 'semana perfeita': media semanal >= user.weekHours", async () => {
    h.world.weeklyHours.push({ userId: 1, totalHours: 40, weekStart: new Date("2026-01-05T00:00:00Z") });
    const met = await evaluateWith({ specialCondition: "semana perfeita" }, { weekHours: 40 });
    expect(met.attempts).toHaveLength(1);
    consoleErrorSpy.mockClear();
    const notMet = await evaluateWith({ specialCondition: "semana perfeita" }, { weekHours: 41 });
    expect(notMet.attempts).toHaveLength(0);
  });

  it("specialCondition 'sequencia ... dias': streak >= 7 (case-insensitive, acento)", async () => {
    const d = (day: number) => new Date(Date.UTC(2026, 0, day));
    h.world.dailyLogs.push({ userId: 1, date: d(1) }, { userId: 1, date: d(2) }, { userId: 1, date: d(3) });
    const notMet = await evaluateWith({ specialCondition: "sequência de dias" }, {});
    expect(notMet.attempts).toHaveLength(0); // streak 3 < 7
    consoleErrorSpy.mockClear();
    h.world.dailyLogs = [d(1), d(2), d(3), d(4), d(5), d(6), d(7)].map((date) => ({ userId: 1, date }));
    const met = await evaluateWith({ specialCondition: "sequência de dias" }, {});
    expect(met.attempts).toHaveLength(1);
  });

  it("QUIRK: specialCondition com 'coordenador' sem o role NAO falha — branch cai no default true", async () => {
    const met = await evaluateWith({ specialCondition: "grupo coordenador" }, { roles: ["COORDENADOR"] });
    expect(met.attempts).toHaveLength(1);
    consoleErrorSpy.mockClear();
    const alsoMet = await evaluateWith({ specialCondition: "grupo coordenador" }, { roles: ["LABORATORISTA"] });
    expect(alsoMet.attempts).toHaveLength(1); // hasRole false => fallthrough => default true
  });

  it("QUIRK: specialCondition com 'gerente' sem o role NAO falha — branch cai no default true", async () => {
    const met = await evaluateWith({ specialCondition: "cargo de gerente" }, { roles: ["GERENTE"] });
    expect(met.attempts).toHaveLength(1);
    consoleErrorSpy.mockClear();
    const alsoMet = await evaluateWith({ specialCondition: "cargo de gerente" }, { roles: [] });
    expect(alsoMet.attempts).toHaveLength(1); // idem: default true
  });

  it("QUIRK: specialCondition desconhecida => TRUE (concedido)", async () => {
    const { attempts } = await evaluateWith({ specialCondition: "condicao que ninguem entende" }, {});
    expect(attempts).toHaveLength(1);
  });

  it("evaluateAllUsers percorre todos os users e avalia cada um", async () => {
    seedUser({ id: 1, points: 100 });
    seedUser({ id: 2, points: 0 });
    await seedBadge({ id: 3, criteria: { points: 50 } });

    const engine = new BadgeRulesEngine();
    await engine.evaluateAllUsers();

    // user 1 atingiu -> tentativa (engolida); user 2 nao -> sem tentativa
    const attempts = consoleErrorSpy.mock.calls.filter((c: any[]) => String(c[0]).startsWith("Error awarding badge 3 to user"));
    expect(attempts).toHaveLength(1);
    expect(String(attempts[0][0])).toBe("Error awarding badge 3 to user 1:");
    expect(h.world.userBadges).toHaveLength(0);
  });
});
