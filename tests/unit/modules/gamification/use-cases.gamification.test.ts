/**
 * OND6-B2 — use cases da gamificacao sobre portas fake (padrão
 * use-cases.work-execution.test.ts). Os VALORES observados sao os congelados pelo
 * golden OND6-B1; a unica divergencia intencional e a QUIRK-6A corrigida (concessao
 * automatica funciona), documentada no contract suite OND6-B3.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DomainError, ForbiddenError, NotFoundError, userActor } from "@/backend/domain";
import type { Badge, UserBadge } from "@/backend/domain";
import { createGamificationModule } from "@/backend/modules/gamification";
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port";
import type { AwardRecord, GamificationAwardHistoryPort } from "@/backend/modules/gamification/application/ports/gamification-award-history.port";
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port";
import type { UserBadgeCreateData, UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port";
import type { UserStatsPort, WeeklyHoursSample } from "@/backend/modules/gamification/application/ports/user-stats.port";

/**
 * B6-2a (D4, DEC-53): os use cases de escrita de badge agora EXIGEM MANAGE_REWARDS e recebem o
 * ator no comando. `COORDENADOR` tem a permissão (matriz real em
 * `backend/domain/identity/permissions.ts`); o papel sem nenhuma permissão de gestão é
 * `VOLUNTARIO`, usado nos casos de negação logo abaixo do bloco "badge management".
 */
const MANAGER_ROLES = ["COORDENADOR"];
const NO_MANAGEMENT_ROLES = ["VOLUNTARIO"];

// ---------------------------------------------------------------------------
// Fakes de portas (com registro de chamadas)
// ---------------------------------------------------------------------------

function makeFakes() {
  const users: GamificationUsersPort & {
    calls: string[];
    data: { id: number; points: number; completedTasks: number; weekHours: number; roles: string[] };
    allUsers: Array<{ id: number; points: number; completedTasks: number }>;
  } = {
    calls: [],
    data: { id: 1, points: 0, completedTasks: 0, weekHours: 0, roles: [] as string[] },
    allUsers: [] as Array<{ id: number; points: number; completedTasks: number }>,
    async findProgressionById(userId) {
      this.calls.push(`findProgressionById:${userId}`);
      if (this.data.id !== userId) return null;
      return { id: this.data.id, points: this.data.points };
    },
    async findUserById(userId) {
      this.calls.push(`findUserById:${userId}`);
      if (this.data.id !== userId) return null;
      return { ...this.data };
    },
    async findAllUsers() {
      this.calls.push("findAllUsers");
      return this.allUsers;
    },
  };

  const awardHistory: GamificationAwardHistoryPort & { records: AwardRecord[]; awarded: Set<string> } = {
    records: [],
    awarded: new Set<string>(),
    async hasAward({ description }) {
      return this.awarded.has(description);
    },
    async awardAndRecord(record) {
      this.records.push(record);
      this.awarded.add(record.description);
      users.data.points += record.pointsAwarded;
    },
  };

  const badges: BadgeCatalogPort & { store: Badge[]; created: Badge[] } = {
    store: [],
    created: [],
    async findAll() {
      return [...this.store];
    },
    async findById(id) {
      return this.store.find((b) => b.id === id) ?? null;
    },
    async findActive() {
      return this.store.filter((b) => b.isActive);
    },
    async findByCategory(category) {
      return this.store.filter((b) => b.category === category);
    },
    async create(data) {
      const badge: Badge = { id: this.store.length + 1, ...data };
      this.store.push(badge);
      this.created.push(badge);
      return badge;
    },
    async update(badge) {
      const idx = this.store.findIndex((b) => b.id === badge.id);
      this.store[idx] = badge;
      return badge;
    },
    async delete(id) {
      const idx = this.store.findIndex((b) => b.id === id);
      if (idx !== -1) this.store.splice(idx, 1);
    },
  };

  const userBadges: UserBadgePort & { store: UserBadge[] } = {
    store: [],
    async findByUserId(userId) {
      return this.store.filter((ub) => ub.userId === userId);
    },
    async findRecentByUserId(userId, limit) {
      return this.store.filter((ub) => ub.userId === userId).slice(0, limit);
    },
    async findByUserAndBadge(userId, badgeId) {
      return this.store.find((ub) => ub.userId === userId && ub.badgeId === badgeId) ?? null;
    },
    async create(data: UserBadgeCreateData) {
      const ub: UserBadge = { id: this.store.length + 1, ...data, earnedAt: new Date() };
      this.store.push(ub);
      return ub;
    },
    async delete(id) {
      const idx = this.store.findIndex((ub) => ub.id === id);
      if (idx !== -1) this.store.splice(idx, 1);
    },
  };

  const stats: UserStatsPort & {
    projects: number;
    sessions: number;
    weekly: WeeklyHoursSample[];
    daily: Date[];
  } = {
    projects: 0,
    sessions: 0,
    weekly: [],
    daily: [],
    async projectsCount() {
      return this.projects;
    },
    async workSessionsCount() {
      return this.sessions;
    },
    async weeklyHoursSamples() {
      return this.weekly;
    },
    async dailyLogDates() {
      return this.daily;
    },
  };

  return { users, awardHistory, badges, userBadges, stats };
}

type Fakes = ReturnType<typeof makeFakes>;

function makeModule(fakes: Fakes) {
  return createGamificationModule({
    ports: {
      users: fakes.users,
      awardHistory: fakes.awardHistory,
      badges: fakes.badges,
      userBadges: fakes.userBadges,
      stats: fakes.stats,
    },
  });
}

let fakes: Fakes;
let module_: ReturnType<typeof makeModule>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fakes = makeFakes();
  module_ = makeModule(fakes);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("AwardFromWorkSessionUseCase (orquestracao frozen golden)", () => {
  it("concede pontos, grava history com descricao da regra e devolve progressao pos-credit", async () => {
    const result = await module_.awardFromWorkSession({ userId: 1, workSessionId: 42, durationSeconds: 7200 });

    expect(result.pointsAwarded).toBe(30);
    expect(result.xpAwarded).toBe(30);
    expect(result.alreadyAwarded).toBe(false);
    expect(result.newProgression.points).toBe(30);
    expect(result.newProgression.level).toBe(0);

    expect(fakes.awardHistory.records).toHaveLength(1);
    expect(fakes.awardHistory.records[0]).toEqual({
      userId: 1,
      sourceType: "WORK_SESSION_COMPLETED",
      sourceId: 42,
      description: "GAMIFICATION:WORK_SESSION_COMPLETED:42",
      pointsAwarded: 30,
      xpAwarded: 30,
    });
  });

  it("idempotencia: segunda chamada => alreadyAwarded, 0 pontos, progressao corrente, sem novo record", async () => {
    await module_.awardFromWorkSession({ userId: 1, workSessionId: 42, durationSeconds: 7200 });
    const second = await module_.awardFromWorkSession({ userId: 1, workSessionId: 42, durationSeconds: 7200 });

    expect(second.alreadyAwarded).toBe(true);
    expect(second.pointsAwarded).toBe(0);
    expect(second.newProgression.points).toBe(30);
    expect(fakes.awardHistory.records).toHaveLength(1);
  });

  it("avalia badges DEPOIS do credit (pontos ja incrementados)", async () => {
    fakes.badges.store.push({
      id: 3,
      name: "Marcante",
      description: "d",
      category: "achievement",
      criteria: { points: 20 },
      isActive: true,
      createdBy: 1,
    });

    const result = await module_.awardFromWorkSession({ userId: 1, workSessionId: 42, durationSeconds: 7200 });

    expect(result.pointsAwarded).toBe(30);
    // QUIRK-6A corrigido na impl nova: a concessao automatica FUNCIONA.
    expect(fakes.userBadges.store).toHaveLength(1);
    expect(fakes.userBadges.store[0]).toMatchObject({ userId: 1, badgeId: 3, earnedBy: null });
  });

  it("usuario inexistente: falha no progression pos-award (mesmo ponto de falha do legado)", async () => {
    fakes.users.data = { id: 999, points: 0, completedTasks: 0, weekHours: 0, roles: [] };
    await expect(module_.awardFromWorkSession({ userId: 1, workSessionId: 1 })).rejects.toThrow("Usuário não encontrado");
  });
});

describe("AwardFromTaskCompletionUseCase", () => {
  it("default 10 em undefined/null; floor; 0 => 0 (sem clamp)", async () => {
    const a = await module_.awardFromTaskCompletion({ userId: 1, taskId: 9 });
    expect(a.pointsAwarded).toBe(10);

    const b = await module_.awardFromTaskCompletion({ userId: 1, taskId: 10, taskPoints: null });
    expect(b.pointsAwarded).toBe(10);

    const c = await module_.awardFromTaskCompletion({ userId: 1, taskId: 11, taskPoints: 15.7 });
    expect(c.pointsAwarded).toBe(15);

    const d = await module_.awardFromTaskCompletion({ userId: 1, taskId: 12, taskPoints: 0 });
    expect(d.pointsAwarded).toBe(0);
    expect(d.alreadyAwarded).toBe(false);
  });

  it("idempotencia por TASK_COMPLETED:<id>; workSession e task com mesmo id sao independentes", async () => {
    await module_.awardFromTaskCompletion({ userId: 1, taskId: 42, taskPoints: 20 });
    const dup = await module_.awardFromTaskCompletion({ userId: 1, taskId: 42, taskPoints: 20 });
    expect(dup.alreadyAwarded).toBe(true);

    const ws = await module_.awardFromWorkSession({ userId: 1, workSessionId: 42 });
    expect(ws.alreadyAwarded).toBe(false);
  });
});

describe("GetUserProgressionUseCase", () => {
  it("NotFound com a mensagem legada exata", async () => {
    await expect(module_.getUserProgression(999)).rejects.toThrow("Usuário não encontrado");
    try {
      await module_.getUserProgression(999);
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as DomainError).status).toBe(404);
    }
  });

  it("progressao pela regra pura", async () => {
    fakes.users.data.points = 250;
    const p = await module_.getUserProgression(1);
    expect(p.level).toBe(2);
    expect(p.nextLevelXp).toBe(300);
    expect(p.progressToNextLevel).toBe(50);
    expect(p.elo).toBe("BRONZE");
  });
});

describe("EvaluateUserBadgesUseCase", () => {
  it("usuario inexistente => NotFound 'Usuário não encontrado'", async () => {
    await expect(module_.evaluateUserBadges(999)).rejects.toThrow("Usuário não encontrado");
  });

  it("sem badges ativos => [] e nenhuma leitura de user-badges/stats", async () => {
    const awarded = await module_.evaluateUserBadges(1);
    expect(awarded).toHaveLength(0);
    expect(fakes.userBadges.store).toHaveLength(0);
  });

  it("concede criterios atingidos com earnedBy null e ignora inativos/ja conquistados", async () => {
    fakes.users.data.points = 100;
    fakes.badges.store.push(
      { id: 1, name: "A", description: "d", category: "achievement", criteria: { points: 50 }, isActive: true, createdBy: 1 },
      { id: 2, name: "B", description: "d", category: "achievement", criteria: null, isActive: true, createdBy: 1 },
      { id: 3, name: "C", description: "d", category: "achievement", criteria: { points: 50 }, isActive: false, createdBy: 1 },
    );
    fakes.userBadges.store.push({ id: 99, userId: 1, badgeId: 2, earnedAt: new Date(), earnedBy: null });

    const awarded = await module_.evaluateUserBadges(1);

    expect(awarded.map((b) => b.id)).toEqual([1]);
    expect(fakes.userBadges.store.filter((ub) => ub.badgeId === 1)).toHaveLength(1);
  });

  it("agrega stats pelas regras puras (media 4 semanas + streak)", async () => {
    fakes.badges.store.push(
      { id: 10, name: "S", description: "d", category: "milestone", criteria: { weeklyHours: 32 }, isActive: true, createdBy: 1 },
      { id: 11, name: "K", description: "d", category: "milestone", criteria: { consecutiveDays: 4 }, isActive: true, createdBy: 1 },
    );
    fakes.stats.weekly = [{ totalHours: 10 }, { totalHours: 10 }, { totalHours: 10 }, { totalHours: 100 }]; // media 32.5
    const d = (day: number) => new Date(Date.UTC(2026, 0, day));
    fakes.stats.daily = [d(1), d(2), d(3), d(10)]; // streak 3

    const awarded = await module_.evaluateUserBadges(1);
    expect(awarded.map((b) => b.id)).toEqual([10]); // weekly atingido; streak 3 < 4
  });

  it("falha de concessao engolida com console.error (padrao legado) e badge fora da lista", async () => {
    fakes.users.data.points = 100;
    fakes.badges.store.push({ id: 5, name: "X", description: "d", category: "achievement", criteria: { points: 50 }, isActive: true, createdBy: 1 });
    const originalCreate = fakes.userBadges.create.bind(fakes.userBadges);
    fakes.userBadges.create = async () => {
      throw new Error("db down");
    };

    const awarded = await module_.evaluateUserBadges(1);

    expect(awarded).toHaveLength(0);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(String(consoleErrorSpy.mock.calls[0][0])).toBe("Error awarding badge 5 to user 1:");
    fakes.userBadges.create = originalCreate;
  });

  it("condicao 'primeiro ... 100 tarefas' usa allUsers (unicidade)", async () => {
    fakes.users.data.completedTasks = 100;
    fakes.badges.store.push({
      id: 6,
      name: "P",
      description: "d",
      category: "special",
      criteria: { specialCondition: "primeiro a atingir 100 tarefas" },
      isActive: true,
      createdBy: 1,
    });
    fakes.users.allUsers = [
      { id: 1, points: 0, completedTasks: 100 },
      { id: 2, points: 0, completedTasks: 100 },
    ];

    const awarded = await module_.evaluateUserBadges(1);
    expect(awarded).toHaveLength(0); // empate => ninguem e o primeiro
  });
});

describe("badge management use cases", () => {
  it("CreateBadgeUseCase: valida (mensagem legada) e entrega dados normalizados ao port", async () => {
    await expect(
      module_.createBadge({ actorRoles: MANAGER_ROLES, name: "  ", description: "d", category: "social", createdBy: 1 }),
    ).rejects.toThrow(
      "Nome do badge é obrigatório",
    );

    const badge = await module_.createBadge({
      actorRoles: MANAGER_ROLES,
      name: " Novo ",
      description: " desc ",
      category: "milestone",
      criteria: { points: 10 },
      createdBy: 2,
    });
    expect(badge.name).toBe("Novo");
    expect(fakes.badges.created[0]).toMatchObject({ name: "Novo", icon: null, criteria: { points: 10 }, isActive: true, createdBy: 2 });
  });

  it("UpdateBadgeUseCase: NotFound legado + merge parcial", async () => {
    await expect(module_.updateBadge({ actorRoles: MANAGER_ROLES, id: 999, data: { name: "x" } })).rejects.toThrow("Badge não encontrado");

    fakes.badges.store.push({
      id: 1,
      name: "Original",
      description: "desc",
      icon: null,
      color: null,
      category: "social",
      criteria: { tasks: 2 },
      isActive: true,
      createdBy: 1,
    });
    const updated = await module_.updateBadge({ actorRoles: MANAGER_ROLES, id: 1, data: { name: "Novo", isActive: false } });
    expect(updated.name).toBe("Novo");
    expect(updated.isActive).toBe(false);
    expect(updated.criteria).toEqual({ tasks: 2 });
  });

  it("DeleteBadgeUseCase: NotFound legado; existente remove", async () => {
    await expect(module_.deleteBadge({ actorRoles: MANAGER_ROLES, id: 999 })).rejects.toThrow("Badge não encontrado");
    fakes.badges.store.push({ id: 1, name: "a", description: "d", category: "social", isActive: true, createdBy: 1 });
    await module_.deleteBadge({ actorRoles: MANAGER_ROLES, id: 1 });
    expect(fakes.badges.store).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // B6-2a (D4, DEC-53) — o gate de MANAGE_REWARDS desceu da rota para estes use
  // cases. As mensagens são as MESMAS que a rota legacy passava ao ensurePermission:
  // são elas que o 403 continua mostrando, e a ordem (permissão antes de validação)
  // é o que mantém o contrato dos status.
  // -------------------------------------------------------------------------

  it("CreateBadgeUseCase: sem MANAGE_REWARDS lança ForbiddenError com a mensagem legada", async () => {
    await expect(
      module_.createBadge({
        actorRoles: NO_MANAGEMENT_ROLES,
        name: "Qualquer",
        description: "d",
        category: "social",
        createdBy: 1,
      }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      module_.createBadge({
        actorRoles: NO_MANAGEMENT_ROLES,
        name: "Qualquer",
        description: "d",
        category: "social",
        createdBy: 1,
      }),
    ).rejects.toThrow("Sem permissão para criar badges");
    expect(fakes.badges.created).toHaveLength(0);
  });

  it("UpdateBadgeUseCase: sem MANAGE_REWARDS lança ForbiddenError com a mensagem legada", async () => {
    await expect(
      module_.updateBadge({ actorRoles: NO_MANAGEMENT_ROLES, id: 1, data: { name: "x" } }),
    ).rejects.toThrow("Sem permissão para atualizar badges");
  });

  it("DeleteBadgeUseCase: sem MANAGE_REWARDS lança ForbiddenError com a mensagem legada", async () => {
    fakes.badges.store.push({ id: 1, name: "a", description: "d", category: "social", isActive: true, createdBy: 1 });
    await expect(module_.deleteBadge({ actorRoles: NO_MANAGEMENT_ROLES, id: 1 })).rejects.toThrow(
      "Sem permissão para excluir badges",
    );
    // a porta nunca foi chamada: o gate barra antes do trabalho
    expect(fakes.badges.store).toHaveLength(1);
  });

  it("gate vem ANTES da validação: sem permissão o id inválido é 403, não 400", async () => {
    // A rota legacy rodava ensurePermission antes de Number(params.id); se a ordem
    // invertesse, quem não tem permissão receberia 400 "Badge inválido".
    await expect(module_.updateBadge({ actorRoles: NO_MANAGEMENT_ROLES, id: NaN, data: {} })).rejects.toThrow(
      "Sem permissão para atualizar badges",
    );
    await expect(module_.deleteBadge({ actorRoles: NO_MANAGEMENT_ROLES, id: NaN })).rejects.toThrow(
      "Sem permissão para excluir badges",
    );
    // com permissão, o id inválido volta a ser o 400 de ValidationError
    await expect(module_.updateBadge({ actorRoles: MANAGER_ROLES, id: NaN, data: {} })).rejects.toThrow("Badge inválido");
    await expect(module_.updateBadge({ actorRoles: MANAGER_ROLES, id: 0, data: {} })).rejects.toThrow("Badge inválido");
    await expect(module_.deleteBadge({ actorRoles: MANAGER_ROLES, id: -1 })).rejects.toThrow("Badge inválido");
  });

  it("papel sujo nega em vez de estourar: assertPermission recebe a sessão como veio", async () => {
    // `actorRoles` é `unknown` de propósito: a regra nunca lança sobre entrada suja
    // (papel desconhecido = negação). Denegar é o comportamento, não um crash.
    await expect(module_.createBadge({ actorRoles: undefined, name: "N", description: "d", category: "social", createdBy: 1 })).rejects.toThrow(
      "Sem permissão para criar badges",
    );
    await expect(module_.createBadge({ actorRoles: "COORDENADOR", name: "N", description: "d", category: "social", createdBy: 1 })).rejects.toThrow(
      "Sem permissão para criar badges",
    );
    await expect(module_.createBadge({ actorRoles: [], name: "N", description: "d", category: "social", createdBy: 1 })).rejects.toThrow(
      "Sem permissão para criar badges",
    );
  });

  it("ListRecentUserBadgesUseCase: default limit 10 (frozen golden)", async () => {
    for (let i = 1; i <= 12; i++) {
      fakes.userBadges.store.push({ id: i, userId: 1, badgeId: i, earnedAt: new Date(), earnedBy: null });
    }
    expect(await module_.listRecentUserBadges(1)).toHaveLength(10);
    expect(await module_.listRecentUserBadges(1, 3)).toHaveLength(3);
  });

  it("AwardBadgeUseCase: NotFound legado, Conflict legado, earnedBy = awardedBy || null", async () => {
    const actor = userActor(1, MANAGER_ROLES);
    await expect(module_.awardBadge({ badgeId: 999, userId: 1, actor })).rejects.toThrow("Badge não encontrado");

    fakes.badges.store.push({ id: 10, name: "a", description: "d", category: "social", isActive: true, createdBy: 1 });
    const ub = await module_.awardBadge({ badgeId: 10, userId: 1, awardedBy: 7, actor });
    expect(ub.earnedBy).toBe(7);

    const conflict = module_.awardBadge({ badgeId: 10, userId: 1, actor });
    await expect(conflict).rejects.toThrow("Usuário já possui este badge");
    try {
      await conflict;
    } catch (error) {
      expect((error as DomainError).status).toBe(409);
    }
  });

  it("B6-2c (D4): sem MANAGE_USERS award/remove levam ForbiddenError e não tocam a porta", async () => {
    const stranger = userActor(9, NO_MANAGEMENT_ROLES);
    const storeBefore = fakes.userBadges.store.length;

    await expect(module_.awardBadge({ badgeId: 10, userId: 1, actor: stranger })).rejects.toThrow("Acesso negado");
    await expect(module_.removeUserBadge({ actor: stranger, userId: 1, badgeId: 10 })).rejects.toThrow("Acesso negado");
    // o gate é a PRIMEIRA linha dos dois: nenhuma porta chega a ser consultada
    expect(fakes.userBadges.store).toHaveLength(storeBefore);
    expect(fakes.badges.store).toHaveLength(0);
  });

  it("RemoveUserBadgeUseCase: NotFound legado; existente remove por id", async () => {
    const actor = userActor(1, MANAGER_ROLES);
    await expect(module_.removeUserBadge({ actor, userId: 1, badgeId: 999 })).rejects.toThrow("Usuário não possui este badge");
    fakes.userBadges.store.push({ id: 42, userId: 1, badgeId: 10, earnedAt: new Date(), earnedBy: null });
    await module_.removeUserBadge({ actor, userId: 1, badgeId: 10 });
    expect(fakes.userBadges.store).toHaveLength(0);
  });
});
