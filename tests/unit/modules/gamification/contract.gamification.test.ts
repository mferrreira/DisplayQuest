// @vitest-environment node
/**
 * OND6-B3 (R3) — contract parity da gamificacao: o LEGACY `PrismaGamificationGateway`
 * (vivo e intocado no seam, DEC-15) vs a NOVA wiring (`createGamificationModule()` sobre
 * os adapters Prisma finos), AMBOS rodando sobre o MESMO fake prisma com o world
 * recriado da semente pristina a cada chamada (DEC-18).
 *
 * Paridade na fronteira observavel: resultados JSON-normalizados (o lado antigo devolve
 * instancias Badge/UserBadge que serializam pelos campos publicos; o novo devolve os
 * contracts puros com os MESMOS campos), estado completo do store apos a chamada e
 * erros comparados por MENSAGEM (DomainErrors novos carregam as mensagens legadas
 * verbatim; status HTTP sao tratados no batch de rotas OND6-B4).
 *
 * UNICA divergencia intencional (pinada explicitamente, nao escondida): QUIRK-6A — o
 * caminho legado de concessao automatica de badge NUNCA concedia (objeto plain ->
 * .toPrisma() TypeError engolido); a impl nova concede. Decisao final preservada para
 * o dono no fecho da onda.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type UserRow = {
  id: number;
  name: string;
  email: string;
  password: string;
  status: string;
  points: number;
  completedTasks: number;
  weekHours: number;
  currentWeekHours: number;
  profileVisibility: string;
  bio: string | null;
  avatar: string | null;
  roles: string[];
  createdAt: Date;
};
type BadgeRow = {
  id: number;
  name: string;
  description: string;
  icon: string | null;
  color: string | null;
  category: string;
  criteria: unknown;
  isActive: boolean;
  createdBy: number;
  createdAt: Date;
};
type UserBadgeRow = { id: number; userId: number; badgeId: number; earnedAt: Date; earnedBy: number | null };
type HistoryRow = {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  performedBy: number;
  description: string;
  oldValues: unknown;
  newValues: unknown;
  metadata: unknown;
  createdAt: Date;
};

interface World {
  users: UserRow[];
  badges: BadgeRow[];
  userBadges: UserBadgeRow[];
  history: HistoryRow[];
  projectMembers: Array<{ userId: number }>;
  workSessions: Array<{ userId: number }>;
  weeklyHours: Array<{ userId: number; totalHours: number; weekStart: Date }>;
  dailyLogs: Array<{ userId: number; date: Date }>;
  seq: { badge: number; userBadge: number; history: number };
}

const T0 = new Date("2026-01-01T00:00:00.000Z");

function userRow(id: number, overrides: Partial<UserRow> = {}): UserRow {
  return {
    id,
    name: `User ${id}`,
    email: `u${id}@dq.test`,
    password: "hashed",
    status: "active",
    points: 0,
    completedTasks: 0,
    weekHours: 0,
    currentWeekHours: 0,
    profileVisibility: "public",
    bio: null,
    avatar: null,
    roles: [],
    createdAt: T0,
    ...overrides,
  };
}

function badgeRow(id: number, overrides: Partial<BadgeRow> = {}): BadgeRow {
  return {
    id,
    name: `Badge ${id}`,
    description: "desc",
    icon: null,
    color: null,
    category: "achievement",
    criteria: null,
    isActive: true,
    createdBy: 1,
    createdAt: new Date(T0.getTime() + id * 86400000),
    ...overrides,
  };
}

interface SeedOverrides {
  users?: UserRow[];
  badges?: BadgeRow[];
  userBadges?: UserBadgeRow[];
  history?: HistoryRow[];
  projectMembers?: Array<{ userId: number }>;
  workSessions?: Array<{ userId: number }>;
  weeklyHours?: Array<{ userId: number; totalHours: number; weekStart: Date }>;
  dailyLogs?: Array<{ userId: number; date: Date }>;
}

function seedWorld(overrides: SeedOverrides = {}): World {
  // structuredClone: cada lado da paridade recebe sua COPIA da semente — o lado
  // antigo nao pode mutar a semente do lado novo (gotcha do harness DEC-18).
  overrides = structuredClone(overrides);
  return {
    users: overrides.users ?? [userRow(1), userRow(2)],
    badges: overrides.badges ?? [],
    userBadges: overrides.userBadges ?? [],
    history: overrides.history ?? [],
    projectMembers: overrides.projectMembers ?? [],
    workSessions: overrides.workSessions ?? [],
    weeklyHours: overrides.weeklyHours ?? [],
    dailyLogs: overrides.dailyLogs ?? [],
    seq: { badge: 100, userBadge: 100, history: 100 },
  };
}

// Fake prisma compartilhado pelos DOIS lados (o gateway legado e os adapters novos
// vao pelo mesmo `@/lib/database/prisma`). Criado em vi.hoisted (TDZ do mock).
const harness = vi.hoisted(() => {
  const current = { value: null as unknown as World };

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
        const row = current.value.users.find((u) => u.id === where.id);
        if (!row) return null;
        if (select) {
          const out: any = {};
          for (const k of Object.keys(select)) if (select[k]) out[k] = row[k as keyof UserRow];
          return out;
        }
        return clone(row);
      },
      async findMany({ select }: any) {
        const rows = [...current.value.users];
        if (select) {
          return rows.map((row) => {
            const out: any = {};
            for (const k of Object.keys(select)) if (select[k]) out[k] = row[k as keyof UserRow];
            return out;
          });
        }
        return rows.map(clone);
      },
      async update({ where, data }: any) {
        const row = current.value.users.find((u) => u.id === where.id);
        if (!row) throw notFound("users", where.id);
        for (const [k, v] of Object.entries(data as any)) {
          if (v && typeof v === "object" && "increment" in (v as any)) {
            (row as any)[k] = ((row as any)[k] ?? 0) + (v as any).increment;
          } else {
            (row as any)[k] = v;
          }
        }
        return clone(row);
      },
    },
    badges: {
      async findUnique({ where }: any) {
        const row = current.value.badges.find((b) => b.id === where.id);
        return row ? clone(row) : null;
      },
      async findMany({ where }: any) {
        let rows = [...current.value.badges];
        if (where) {
          if (where.isActive !== undefined) rows = rows.filter((b) => b.isActive === where.isActive);
          if (where.category !== undefined) rows = rows.filter((b) => b.category === where.category);
        }
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows.map(clone);
      },
      async create({ data }: any) {
        const row: BadgeRow = {
          id: current.value.seq.badge++,
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
        current.value.badges.push(row);
        return clone(row);
      },
      async update({ where, data }: any) {
        const row = current.value.badges.find((b) => b.id === where.id);
        if (!row) throw notFound("badges", where.id);
        for (const k of ["name", "description", "icon", "color", "category", "criteria", "isActive", "createdBy"]) {
          if (data[k] !== undefined) (row as any)[k] = k === "criteria" ? normalizeJson(data[k]) : data[k];
        }
        return clone(row);
      },
      async delete({ where }: any) {
        const idx = current.value.badges.findIndex((b) => b.id === where.id);
        if (idx === -1) throw notFound("badges", where.id);
        current.value.badges.splice(idx, 1);
      },
    },
    user_badges: {
      async findMany({ where, take }: any) {
        let rows = [...current.value.userBadges];
        if (where) {
          if (where.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId);
          if (where.badgeId !== undefined) rows = rows.filter((r) => r.badgeId === where.badgeId);
        }
        rows.sort((a, b) => b.earnedAt.getTime() - a.earnedAt.getTime());
        if (take !== undefined) rows = rows.slice(0, take);
        return rows.map(clone);
      },
      async findUnique({ where }: any) {
        const c = where.userId_badgeId;
        const row = current.value.userBadges.find((r) => r.userId === c.userId && r.badgeId === c.badgeId);
        return row ? clone(row) : null;
      },
      async create({ data }: any) {
        const row: UserBadgeRow = {
          id: current.value.seq.userBadge++,
          userId: data.userId,
          badgeId: data.badgeId,
          earnedAt: data.earnedAt ?? new Date(),
          earnedBy: data.earnedBy ?? null,
        };
        current.value.userBadges.push(row);
        return clone(row);
      },
      async delete({ where }: any) {
        const idx = current.value.userBadges.findIndex((r) => r.id === where.id);
        if (idx === -1) throw notFound("user_badges", JSON.stringify(where));
        current.value.userBadges.splice(idx, 1);
      },
    },
    history: {
      async findFirst({ where }: any) {
        const row = current.value.history.find(
          (r) =>
            r.entityType === where.entityType &&
            r.entityId === where.entityId &&
            r.action === where.action &&
            (where.description === undefined || r.description === where.description),
        );
        return row ? clone(row) : null;
      },
      async create({ data }: any) {
        const row: HistoryRow = {
          id: current.value.seq.history++,
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
        current.value.history.push(row);
        return clone(row);
      },
    },
    project_members: {
      async count({ where }: any) {
        return current.value.projectMembers.filter((r) => r.userId === where.userId).length;
      },
    },
    work_sessions: {
      async count({ where }: any) {
        return current.value.workSessions.filter((r) => r.userId === where.userId).length;
      },
    },
    weekly_hours_history: {
      async findMany({ where, take }: any) {
        let rows = current.value.weeklyHours.filter((r) => r.userId === where.userId);
        rows = [...rows].sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
        if (take !== undefined) rows = rows.slice(0, take);
        return rows.map(clone);
      },
    },
    daily_logs: {
      async findMany({ where }: any) {
        const rows = current.value.dailyLogs
          .filter((r) => r.userId === where.userId)
          .sort((a, b) => a.date.getTime() - b.date.getTime());
        return rows.map(clone);
      },
    },
    async $transaction(fn: any) {
      return fn(fake);
    },
  };

  return { current, prisma: fake };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: harness.prisma }));

import { PrismaGamificationGateway } from "@/backend/modules/gamification/infrastructure/prisma-gamification.gateway";
import { createGamificationModule } from "@/backend/modules/gamification";
import type { GamificationGateway } from "@/backend/modules/gamification/application/ports/gamification.gateway";
import { createTaskProgressEvents } from "@/backend/modules/task-management/infrastructure/gamification-task-progress.events";
import { createWorkExecutionEventsPublisher } from "@/backend/modules/work-execution/infrastructure/work-execution-events.publisher";
import type { WorkSessionCompletedEvent } from "@/backend/modules/work-execution/application/ports/work-execution.events";
import type { GamificationAwardsPort } from "@/backend/modules/work-execution/application/ports/gamification-awards.port";
import type { TaskAwardPort } from "@/backend/modules/task-management/infrastructure/gamification-task-progress.events";

// ---------------------------------------------------------------------------
// Harness de paridade (DEC-18)
// ---------------------------------------------------------------------------

const json = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));

function freshWorld(overrides: SeedOverrides = {}) {
  harness.current.value = seedWorld(overrides);
}

function snapshot(): string {
  return JSON.stringify(harness.current.value);
}

async function captureError(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "<sem erro>";
  } catch (error) {
    return (error as Error).message;
  }
}

async function parity<T>(
  run: (subject: GamificationGateway) => Promise<T>,
  overrides: SeedOverrides = {},
): Promise<{ oldResult: T; newResult: T; oldState: string; newState: string }> {
  freshWorld(overrides);
  const oldSubject = new PrismaGamificationGateway();
  const oldResult = await run(oldSubject);
  const oldState = snapshot();

  freshWorld(overrides);
  const newSubject = createGamificationModule() as unknown as GamificationGateway;
  const newResult = await run(newSubject);
  const newState = snapshot();

  return { oldResult, newResult, oldState, newState };
}

function expectParity<T>(bundle: { oldResult: T; newResult: T; oldState: string; newState: string }) {
  expect(json(bundle.newResult)).toEqual(json(bundle.oldResult));
  expect(bundle.newState).toBe(bundle.oldState);
}

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
  consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Awards
// ---------------------------------------------------------------------------

describe("contract: awards (old gateway vs new wiring)", () => {
  it("awardFromWorkSession 2h: resultado + history + pontos em paridade", async () => {
    const bundle = await parity((subject) => subject.awardFromWorkSession({ userId: 1, workSessionId: 42, durationSeconds: 7200 }));
    expectParity(bundle);
    expect(json(bundle.oldResult)).toMatchObject({
      pointsAwarded: 30,
      xpAwarded: 30,
      alreadyAwarded: false,
      newProgression: { points: 30, level: 0, elo: "BRONZE", progressToNextLevel: 30 },
    });
  });

  it("awardFromWorkSession com tarefas + duracao combinadas", async () => {
    const bundle = await parity((subject) =>
      subject.awardFromWorkSession({ userId: 1, workSessionId: 43, durationSeconds: 7200, completedTaskIds: [1, 2, 3, 4] }),
    );
    expectParity(bundle);
    expect(json(bundle.oldResult).pointsAwarded).toBe(50);
  });

  it("awardFromWorkSession idempotente (history pre-seedado na descricao)", async () => {
    const bundle = await parity(
      (subject) => subject.awardFromWorkSession({ userId: 1, workSessionId: 42, durationSeconds: 7200 }),
      {
        history: [
          {
            id: 1,
            entityType: "USER",
            entityId: 1,
            action: "GAMIFICATION_AWARD",
            performedBy: 1,
            description: "GAMIFICATION:WORK_SESSION_COMPLETED:42",
            oldValues: null,
            newValues: null,
            metadata: null,
            createdAt: T0,
          },
        ],
        users: [userRow(1, { points: 30 }), userRow(2)],
      },
    );
    expectParity(bundle);
    expect(json(bundle.oldResult)).toMatchObject({ alreadyAwarded: true, pointsAwarded: 0 });
  });

  it("awardFromTaskCompletion default/floor/0", async () => {
    for (const [taskId, taskPoints, expected] of [
      [9, undefined, 10],
      [10, null, 10],
      [11, 15.7, 15],
      [12, 0, 0],
    ] as const) {
      const bundle = await parity((subject) =>
        subject.awardFromTaskCompletion({ userId: 1, taskId, taskPoints: taskPoints as number | null | undefined }),
      );
      expectParity(bundle);
      expect(json(bundle.oldResult).pointsAwarded).toBe(expected);
    }
  });

  it("workSession 42 e task 42: fontes distintas, ambos concedem (paridade)", async () => {
    const bundle = await parity(async (subject) => {
      const ws = await subject.awardFromWorkSession({ userId: 1, workSessionId: 42 });
      const task = await subject.awardFromTaskCompletion({ userId: 1, taskId: 42 });
      return { ws: json(ws), task: json(task) };
    });
    expectParity(bundle);
    expect(json(bundle.oldResult).ws.alreadyAwarded).toBe(false);
    expect(json(bundle.oldResult).task.alreadyAwarded).toBe(false);
  });

  it("award para usuario inexistente falha com a MESMA mensagem (tx do mesmo fake)", async () => {
    const oldError = await (async () => {
      freshWorld();
      return captureError(() => new PrismaGamificationGateway().awardFromWorkSession({ userId: 999, workSessionId: 1 }));
    })();
    const newError = await (async () => {
      freshWorld();
      return captureError(() => (createGamificationModule() as unknown as GamificationGateway).awardFromWorkSession({ userId: 999, workSessionId: 1 }));
    })();
    expect(newError).toBe(oldError);
  });
});

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

describe("contract: getUserProgression", () => {
  it("usuario com pontos: progressao identica", async () => {
    const bundle = await parity((subject) => subject.getUserProgression(1), {
      users: [userRow(1, { points: 250 }), userRow(2)],
    });
    expectParity(bundle);
    expect(json(bundle.oldResult)).toMatchObject({ level: 2, nextLevelXp: 300, progressToNextLevel: 50, elo: "BRONZE" });
  });

  it("pontos negativos: xp clampado, points cru (paridade)", async () => {
    const bundle = await parity((subject) => subject.getUserProgression(1), {
      users: [userRow(1, { points: -50 }), userRow(2)],
    });
    expectParity(bundle);
    expect(json(bundle.oldResult)).toMatchObject({ points: -50, xp: 0, level: 0, elo: "BRONZE" });
  });

  it("elo nas fronteiras 700/1500/2500", async () => {
    for (const points of [699, 700, 1500, 2500]) {
      const bundle = await parity((subject) => subject.getUserProgression(1), {
        users: [userRow(1, { points }), userRow(2)],
      });
      expect(json(bundle.newResult).elo).toBe(json(bundle.oldResult).elo);
    }
  });

  it("usuario inexistente: mesma mensagem", async () => {
    const bundle = await parity(async (subject) => captureError(() => subject.getUserProgression(999)));
    expect(bundle.newResult).toBe(bundle.oldResult);
    expect(bundle.oldResult).toBe("Usuário não encontrado");
  });
});

// ---------------------------------------------------------------------------
// Badges CRUD + user-badges
// ---------------------------------------------------------------------------

describe("contract: badges", () => {
  it("listBadges createdAt DESC", async () => {
    const bundle = await parity((subject) => subject.listBadges(), {
      badges: [badgeRow(1), badgeRow(2), badgeRow(3, { isActive: false })],
    });
    expectParity(bundle);
    expect(json(bundle.oldResult).map((b: { id: number }) => b.id)).toEqual([3, 2, 1]);
  });

  it("getBadgeById existente e inexistente", async () => {
    const found = await parity((subject) => subject.getBadgeById(2), { badges: [badgeRow(1), badgeRow(2)] });
    expectParity(found);
    const missing = await parity((subject) => subject.getBadgeById(999), { badges: [badgeRow(1)] });
    expectParity(missing);
    expect(missing.oldResult).toBeNull();
  });

  it("createBadge valido: shape JSON + store em paridade (QUIRK-6B dos dois lados)", async () => {
    const bundle = await parity((subject) =>
      subject.createBadge({ name: "  Pioneiro  ", description: " primeiro ", category: "milestone", createdBy: 2 }),
    );
    expectParity(bundle);
    expect(json(bundle.oldResult)).toMatchObject({ name: "Pioneiro", icon: null, criteria: null, isActive: true, createdBy: 2 });
  });

  it("createBadge invalido: mensagens exatas (nome/descricao/categoria/criador)", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ name: "  ", description: "d", category: "social", createdBy: 1 }, "Nome do badge é obrigatório"],
      [{ name: "n", description: "  ", category: "social", createdBy: 1 }, "Descrição do badge é obrigatória"],
      [{ name: "n", description: "d", category: "bogus", createdBy: 1 }, "Categoria de badge inválida"],
      [{ name: "n", description: "d", category: "social", createdBy: 0 }, "Criador do badge é obrigatório"],
    ];
    for (const [data, message] of cases) {
      const bundle = await parity(async (subject) => captureError(() => subject.createBadge(data as any)));
      expect(bundle.newResult).toBe(bundle.oldResult);
      expect(bundle.oldResult).toBe(message);
    }
  });

  it("updateBadge merge parcial + 'Badge não encontrado'", async () => {
    const ok = await parity((subject) => subject.updateBadge({ id: 1, data: { name: "Renomeado", isActive: false } }), {
      badges: [badgeRow(1, { criteria: { points: 10 } })],
    });
    expectParity(ok);
    expect(json(ok.oldResult)).toMatchObject({ name: "Renomeado", isActive: false, criteria: { points: 10 } });

    const missing = await parity(async (subject) => captureError(() => subject.updateBadge({ id: 999, data: { name: "x" } })));
    expect(missing.newResult).toBe("Badge não encontrado");
    expect(missing.newResult).toBe(missing.oldResult);
  });

  it("deleteBadge + 'Badge não encontrado' no segundo delete", async () => {
    const bundle = await parity(async (subject) => {
      await subject.deleteBadge(1);
      return captureError(() => subject.deleteBadge(1));
    }, { badges: [badgeRow(1)] });
    expectParity(bundle);
    expect(bundle.oldResult).toBe("Badge não encontrado");
  });

  it("listUserBadges earnedAt DESC + listRecentUserBadges limit", async () => {
    const bundle = await parity(async (subject) => {
      const all = await subject.listUserBadges(1);
      const recent = await subject.listRecentUserBadges(1, 2);
      return { all: json(all), recent: json(recent) };
    }, {
      userBadges: [
        { id: 1, userId: 1, badgeId: 10, earnedAt: new Date("2026-01-01T00:00:00Z"), earnedBy: null },
        { id: 2, userId: 1, badgeId: 11, earnedAt: new Date("2026-02-01T00:00:00Z"), earnedBy: 2 },
        { id: 3, userId: 1, badgeId: 12, earnedAt: new Date("2026-03-01T00:00:00Z"), earnedBy: null },
      ],
    });
    expectParity(bundle);
    expect(json(bundle.oldResult).all.map((b: { badgeId: number }) => b.badgeId)).toEqual([12, 11, 10]);
    expect(json(bundle.oldResult).recent.map((b: { badgeId: number }) => b.badgeId)).toEqual([12, 11]);
  });

  it("awardBadge manual: earnedBy + conflito 'Usuário já possui este badge'", async () => {
    const bundle = await parity(async (subject) => {
      const awarded = await subject.awardBadge({ badgeId: 10, userId: 1, awardedBy: 2 });
      const dup = await captureError(() => subject.awardBadge({ badgeId: 10, userId: 1 }));
      const missing = await captureError(() => subject.awardBadge({ badgeId: 999, userId: 1 }));
      return { awarded: json(awarded), dup, missing };
    }, { badges: [badgeRow(10)] });
    expectParity(bundle);
    expect(json(bundle.oldResult).awarded).toMatchObject({ userId: 1, badgeId: 10, earnedBy: 2 });
    expect(bundle.oldResult.dup).toBe("Usuário já possui este badge");
    expect(bundle.oldResult.missing).toBe("Badge não encontrado");
  });

  it("removeUserBadge + 'Usuário não possui este badge'", async () => {
    const bundle = await parity(async (subject) => {
      await subject.removeUserBadge(1, 10);
      return captureError(() => subject.removeUserBadge(1, 10));
    }, {
      userBadges: [{ id: 1, userId: 1, badgeId: 10, earnedAt: T0, earnedBy: null }],
    });
    expectParity(bundle);
    expect(bundle.oldResult).toBe("Usuário não possui este badge");
  });
});

// ---------------------------------------------------------------------------
// Avaliacao de badges — paridade onde o legado NAO tentava conceder,
// divergencia PINADA onde tentava (QUIRK-6A).
// ---------------------------------------------------------------------------

describe("contract: evaluateUserBadges", () => {
  it("usuario inexistente: mesma mensagem", async () => {
    const bundle = await parity(async (subject) => captureError(() => subject.evaluateUserBadges(999)));
    expect(bundle.newResult).toBe("Usuário não encontrado");
    expect(bundle.newResult).toBe(bundle.oldResult);
  });

  it("sem badges ativos: [] e store intacto dos dois lados", async () => {
    const bundle = await parity((subject) => subject.evaluateUserBadges(1));
    expectParity(bundle);
    expect(bundle.oldResult).toHaveLength(0);
  });

  it("badge manual (sem criteria): nunca concedido — paridade", async () => {
    const bundle = await parity((subject) => subject.evaluateUserBadges(1), {
      badges: [badgeRow(3, { criteria: null })],
    });
    expectParity(bundle);
    expect(bundle.oldResult).toHaveLength(0);
    expect(harness.current.value.userBadges).toHaveLength(0);
  });

  it("criterio NAO atingido: nenhuma tentativa dos dois lados (paridade)", async () => {
    const bundle = await parity((subject) => subject.evaluateUserBadges(1), {
      users: [userRow(1, { points: 10 }), userRow(2)],
      badges: [badgeRow(3, { criteria: { points: 20 } })],
    });
    expectParity(bundle);
    expect(bundle.oldResult).toHaveLength(0);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("badge ja conquistado: pulado dos dois lados (paridade)", async () => {
    const bundle = await parity((subject) => subject.evaluateUserBadges(1), {
      users: [userRow(1, { points: 100 }), userRow(2)],
      badges: [badgeRow(3, { criteria: { points: 20 } })],
      userBadges: [{ id: 1, userId: 1, badgeId: 3, earnedAt: T0, earnedBy: null }],
    });
    expectParity(bundle);
    expect(bundle.oldResult).toHaveLength(0);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("stats via portas em paridade (weekly media + streak + contagens) — criterio NAO atingido", async () => {
    const d = (day: number) => new Date(Date.UTC(2026, 0, day));
    const bundle = await parity((subject) => subject.evaluateUserBadges(1), {
      badges: [
        badgeRow(4, { criteria: { weeklyHours: 40 } }),
        badgeRow(5, { criteria: { consecutiveDays: 8 } }),
        badgeRow(6, { criteria: { projects: 5 } }),
        badgeRow(7, { criteria: { workSessions: 5 } }),
      ],
      weeklyHours: [10, 10, 10, 10].map((totalHours, i) => ({ userId: 1, totalHours, weekStart: d(i * 7 + 1) })),
      dailyLogs: [1, 2, 3].map((day) => ({ userId: 1, date: d(day) })),
      projectMembers: [{ userId: 1 }, { userId: 1 }],
      workSessions: [{ userId: 1 }],
    });
    expectParity(bundle);
    expect(bundle.oldResult).toHaveLength(0);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("DIVERGENCIA QUIRK-6A (pinada para decisao do dono): criterio atingido — legado engole e NUNCA concede; novo concede", async () => {
    const overrides: SeedOverrides = {
      users: [userRow(1, { points: 30 }), userRow(2)],
      badges: [badgeRow(3, { criteria: { points: 20 } })],
    };

    // lado antigo
    freshWorld(overrides);
    const oldEarned = await new PrismaGamificationGateway().evaluateUserBadges(1);
    const oldState = snapshot();
    const oldConsoleCalls = consoleSpy.mock.calls.length;

    // lado novo
    freshWorld(overrides);
    consoleSpy.mockClear();
    const newEarned = await (createGamificationModule() as unknown as GamificationGateway).evaluateUserBadges(1);
    const newState = snapshot();
    const newConsoleCalls = consoleSpy.mock.calls.length;

    // legado: TypeError engolido, nenhuma concessao (golden 6.1)
    expect(oldEarned).toHaveLength(0);
    expect(JSON.parse(oldState).userBadges).toHaveLength(0);
    expect(oldConsoleCalls).toBe(1);

    // novo: concessao FUNCIONA (earnedBy null, caminho de regras vivo)
    expect(newEarned.map((b) => b.id)).toEqual([3]);
    const newBadges = JSON.parse(newState).userBadges as Array<{ userId: number; badgeId: number; earnedBy: number | null }>;
    expect(newBadges).toHaveLength(1);
    expect(newBadges[0]).toMatchObject({ userId: 1, badgeId: 3, earnedBy: null });
    expect(newConsoleCalls).toBe(0);
  });

  it("DIVERGENCIA QUIRK-6A no caminho de award: awardFromWorkSession com criterio atingido", async () => {
    const overrides: SeedOverrides = {
      badges: [badgeRow(3, { criteria: { points: 20 } })],
    };

    freshWorld(overrides);
    await new PrismaGamificationGateway().awardFromWorkSession({ userId: 1, workSessionId: 42, durationSeconds: 7200 });
    expect(harness.current.value.userBadges).toHaveLength(0); // legado nunca concede

    freshWorld(overrides);
    await (createGamificationModule() as unknown as GamificationGateway).awardFromWorkSession({
      userId: 1,
      workSessionId: 42,
      durationSeconds: 7200,
    });
    expect(harness.current.value.userBadges).toHaveLength(1); // novo concede
    expect(harness.current.value.userBadges[0]).toMatchObject({ userId: 1, badgeId: 3, earnedBy: null });
  });
});

// ---------------------------------------------------------------------------
// Eventos de progresso normalizados como portas (PLAN ONDA 6 / DEC-21)
// ---------------------------------------------------------------------------

describe("contract: eventos de progresso via portas locais (work-execution + task-management)", () => {
  it("a nova wiring CASA estruturalmente com GamificationAwardsPort e TaskAwardPort", () => {
    const module_ = createGamificationModule();
    const awardsPort: GamificationAwardsPort = module_;
    const taskPort: TaskAwardPort = module_;
    expect(typeof awardsPort.awardFromWorkSession).toBe("function");
    expect(typeof taskPort.awardFromTaskCompletion).toBe("function");
  });

  it("publisher de work-execution -> award via porta (paridade com o gateway legado)", async () => {
    const event = {
      session: { id: 77, userId: 1, duration: 3600 },
      completedTaskIds: [1],
    } as unknown as WorkSessionCompletedEvent;

    freshWorld();
    const publisher = createWorkExecutionEventsPublisher({ awards: createGamificationModule() });
    await publisher.onWorkSessionCompleted(event);
    const newState = snapshot();

    freshWorld();
    const legacyPublisher = createWorkExecutionEventsPublisher({ awards: new PrismaGamificationGateway() });
    await legacyPublisher.onWorkSessionCompleted(event);
    const oldState = snapshot();

    expect(newState).toBe(oldState);
    expect(JSON.parse(oldState).history[0].description).toBe("GAMIFICATION:WORK_SESSION_COMPLETED:77");
  });

  it("publisher de task-management -> award via porta (paridade com o gateway legado)", async () => {
    freshWorld();
    const events = createTaskProgressEvents({ awards: createGamificationModule() });
    await events.onTaskCompleted({ userId: 1, taskId: 55, taskPoints: 20 });
    const newState = snapshot();

    freshWorld();
    const legacyEvents = createTaskProgressEvents({ awards: new PrismaGamificationGateway() });
    await legacyEvents.onTaskCompleted({ userId: 1, taskId: 55, taskPoints: 20 });
    const oldState = snapshot();

    expect(newState).toBe(oldState);
    expect(JSON.parse(oldState).history[0].description).toBe("GAMIFICATION:TASK_COMPLETED:55");
  });
});
