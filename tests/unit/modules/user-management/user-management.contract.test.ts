// @vitest-environment node
/**
 * OND2-B2 (R3) — contract test of the `UserManagementGateway` port surface.
 *
 * The SAME matrix runs against:
 *   (a) the legacy `UserServiceGateway` (unchanged, fake UserRepository + mocked prisma seam);
 *   (b) the new use-case wiring (`createUserManagementModule({ repository, passwordHasher })`
 *       over a fake `UserRepositoryPort` mirroring the fake UserRepository).
 *
 * Comparison is at the OBSERVABLE boundary the routes see: results are JSON-normalized (the
 * legacy `User` model instances serialize through `toJSON()` = public shape; the new wiring
 * returns that shape directly) and thrown errors are compared by MESSAGE (the types evolved
 * from generic Error to DomainError — DEC-16 mapping lands in OND2-B3).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type SeedUser = {
    id: number;
    name: string;
    email: string;
    points?: number;
    completedTasks?: number;
    password?: string | null;
    status?: string;
    weekHours?: number;
    currentWeekHours?: number;
    profileVisibility?: string;
    bio?: string | null;
    avatar?: string | null;
    roles?: string[];
  };

  const state = {
    users: [] as SeedUser[],
    memberships: [] as Array<{ userId: number; projectId: number }>,
    projects: [] as Array<{ id: number; leaderId: number }>,
  };

  const prisma = {
    users: {
      findMany: async (args: { where?: Record<string, unknown>; select?: Record<string, boolean>; orderBy?: Record<string, string> }) => {
        let rows = [...state.users];
        if (args.where?.status !== undefined) rows = rows.filter((row) => row.status === args.where!.status);
        if (args.orderBy?.name === "asc") rows.sort((a, b) => a.name.localeCompare(b.name));
        if (args.select) {
          return rows.map((row) => {
            const out: Record<string, unknown> = {};
            for (const [key, selected] of Object.entries(args.select!)) {
              if (selected) out[key] = (row as Record<string, unknown>)[key];
            }
            return out;
          });
        }
        return rows;
      },
    },
    project_members: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        const found = state.memberships.find(
          (m) => m.userId === args.where.userId && (args.where.projectId === undefined || m.projectId === args.where.projectId),
        );
        return found ? { id: 1 } : null;
      },
    },
    projects: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        const found = state.projects.find(
          (p) => (args.where.id === undefined || p.id === args.where.id) && p.leaderId === args.where.leaderId,
        );
        return found ? { id: 1 } : null;
      },
    },
  };

  const bcryptFake = {
    hash: async (value: string) => `bcrypt:${value}`,
    compare: async (value: string, hashed: string) => hashed === `bcrypt:${value}`,
  };

  function reset(users: SeedUser[] = [], memberships: Array<{ userId: number; projectId: number }> = [], projects: Array<{ id: number; leaderId: number }> = []) {
    state.users = users.map((u) => ({
      points: 0,
      completedTasks: 0,
      password: null,
      status: "active",
      weekHours: 0,
      currentWeekHours: 0,
      profileVisibility: "public",
      bio: null,
      avatar: null,
      roles: [],
      ...u,
    }));
    state.memberships = memberships;
    state.projects = projects;
  }

  return { state, prisma, bcryptFake, reset };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: harness.prisma }));
vi.mock("bcryptjs", () => ({
  default: harness.bcryptFake,
  hash: harness.bcryptFake.hash,
  compare: harness.bcryptFake.compare,
}));

import { User } from "@/backend/models/user/User";
import { UserServiceGateway } from "@/backend/modules/user-management/infrastructure/user-service.gateway";
import { createUserManagementModule } from "@/backend/modules/user-management";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import type { PasswordHasher } from "@/backend/modules/user-management/application/ports/password-hasher";
import type { UserRecord, UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository";

const norm = (value: unknown): unknown => JSON.parse(JSON.stringify(value ?? null));

/** Legacy-side fake: repository over `User` model instances (mirrors backend/repositories). */
class FakeUserModelRepository {
  store: User[] = [];
  private nextId = 1;
  private clone(user: User): User {
    return new User(user);
  }
  async findById(id: number) {
    const found = this.store.find((u) => u.id === id);
    return found ? this.clone(found) : null;
  }
  async findByEmail(email: string) {
    const found = this.store.find((u) => u.email === email.toLowerCase());
    return found ? this.clone(found) : null;
  }
  async create(user: User) {
    const stored = this.clone(user);
    stored.id = this.nextId++;
    this.store.push(stored);
    return this.clone(stored);
  }
  async update(user: User) {
    if (!user.id) throw new Error("User ID é obrigatório para atualização");
    const index = this.store.findIndex((u) => u.id === user.id);
    this.store[index] = this.clone(user);
    return this.clone(this.store[index]);
  }
  async delete(id: number) {
    this.store = this.store.filter((u) => u.id !== id);
  }
  async findPending() {
    return this.store.filter((u) => u.status === "pending").map((u) => this.clone(u));
  }
  async findTopByPoints(limit = 10) {
    return [...this.store].filter((u) => u.status === "active").sort((a, b) => b.points - a.points).slice(0, limit).map((u) => this.clone(u));
  }
  async findTopByTasks(limit = 10) {
    return [...this.store].filter((u) => u.status === "active").sort((a, b) => b.completedTasks - a.completedTasks).slice(0, limit).map((u) => this.clone(u));
  }
  async findByProfileVisibility() {
    return this.store.map((u) => this.clone(u));
  }
  async getUsersByRole() {
    const counts: Record<string, number> = {};
    for (const user of this.store) for (const role of user.roles) counts[role] = (counts[role] ?? 0) + 1;
    return counts;
  }
  async getUsersByStatus() {
    const counts: Record<string, number> = {};
    for (const user of this.store) counts[user.status] = (counts[user.status] ?? 0) + 1;
    return counts;
  }
  async getUserStatistics() {
    return {
      total: this.store.length,
      active: this.store.filter((u) => u.status === "active").length,
      pending: this.store.filter((u) => u.status === "pending").length,
      rejected: this.store.filter((u) => u.status === "rejected").length,
      suspended: this.store.filter((u) => u.status === "suspended").length,
      inactive: this.store.filter((u) => u.status === "inactive").length,
      totalPoints: this.store.reduce((sum, u) => sum + u.points, 0),
      totalTasks: this.store.reduce((sum, u) => sum + u.completedTasks, 0),
      averagePoints: 0,
      averageTasks: 0,
    };
  }
}

/** New-side fake: `UserRepositoryPort` over plain records, mirroring the fake above. */
class FakeUserRepositoryPort implements UserRepositoryPort {
  store: UserRecord[] = [];
  private nextId = 1;

  constructor(seed: Array<Partial<UserRecord> & { id: number }>) {
    this.store = seed.map((row) => ({
      name: `User ${row.id}`,
      email: `u${row.id}@x.com`,
      points: 0,
      completedTasks: 0,
      password: null,
      status: "active",
      weekHours: 0,
      currentWeekHours: 0,
      profileVisibility: "public",
      bio: null,
      avatar: null,
      roles: [],
      ...row,
    }) as UserRecord);
    this.nextId = Math.max(...seed.map((row) => row.id), 0) + 1;
  }

  private clone(record: UserRecord): UserRecord {
    return { ...record, roles: [...record.roles] };
  }

  async findById(id: number) {
    const found = this.store.find((u) => u.id === id);
    return found ? this.clone(found) : null;
  }
  async findByEmail(email: string) {
    const found = this.store.find((u) => u.email === email.toLowerCase());
    return found ? this.clone(found) : null;
  }
  async create(data: Omit<UserRecord, "id" | "createdAt">) {
    const stored = { ...data, id: this.nextId++ } as UserRecord;
    this.store.push(this.clone(stored));
    return this.clone(stored);
  }
  async update(record: UserRecord) {
    const index = this.store.findIndex((u) => u.id === record.id);
    this.store[index] = this.clone(record);
    return this.clone(this.store[index]);
  }
  async delete(id: number) {
    this.store = this.store.filter((u) => u.id !== id);
  }
  async findPending() {
    return this.store.filter((u) => u.status === "pending").map((u) => this.clone(u));
  }
  async findActiveUsers() {
    return this.store
      .filter((u) => u.status === "active")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roles: [...u.roles],
        status: u.status,
        weekHours: u.weekHours,
        points: u.points,
        completedTasks: u.completedTasks,
        avatar: u.avatar,
        bio: u.bio,
      }));
  }
  async findTopByPoints(limit: number) {
    return this.store.filter((u) => u.status === "active").sort((a, b) => b.points - a.points).slice(0, limit).map((u) => this.clone(u));
  }
  async findTopByTasks(limit: number) {
    return this.store.filter((u) => u.status === "active").sort((a, b) => b.completedTasks - a.completedTasks).slice(0, limit).map((u) => this.clone(u));
  }
  async findAll() {
    return this.store.map((u) => this.clone(u));
  }
  async findByProfileVisibility() {
    return this.store.map((u) => this.clone(u));
  }
  async getUsersByRole() {
    const counts: Record<string, number> = {};
    for (const user of this.store) for (const role of user.roles) counts[role] = (counts[role] ?? 0) + 1;
    return counts;
  }
  async getUsersByStatus() {
    const counts: Record<string, number> = {};
    for (const user of this.store) counts[user.status] = (counts[user.status] ?? 0) + 1;
    return counts;
  }
  async getUserStatistics() {
    return {
      total: this.store.length,
      active: this.store.filter((u) => u.status === "active").length,
      pending: this.store.filter((u) => u.status === "pending").length,
      rejected: this.store.filter((u) => u.status === "rejected").length,
      suspended: this.store.filter((u) => u.status === "suspended").length,
      inactive: this.store.filter((u) => u.status === "inactive").length,
      totalPoints: this.store.reduce((sum, u) => sum + u.points, 0),
      totalTasks: this.store.reduce((sum, u) => sum + u.completedTasks, 0),
      averagePoints: 0,
      averageTasks: 0,
    };
  }
  async isProjectMember(userId: number, projectId?: number) {
    return harness.state.memberships.some(
      (m) => m.userId === userId && (projectId === undefined || m.projectId === projectId),
    );
  }
  async leadsProject(userId: number, projectId?: number) {
    return harness.state.projects.some(
      (p) => (projectId === undefined || p.id === projectId) && p.leaderId === userId,
    );
  }
}

const fakeHasher: PasswordHasher = {
  hash: async (plain: string) => `bcrypt:${plain}`,
};

type SeedUser = NonNullable<Parameters<typeof harness.reset>[0]>[number];

function buildSides(seedUsers: SeedUser[] = [], memberships: Array<{ userId: number; projectId: number }> = [], projects: Array<{ id: number; leaderId: number }> = []) {
  harness.reset(seedUsers, memberships, projects);

  const legacyRepo = new FakeUserModelRepository();
  for (const seed of seedUsers) {
    const user = new User({
      id: seed.id,
      name: seed.name,
      email: seed.email,
      points: seed.points ?? 0,
      completedTasks: seed.completedTasks ?? 0,
      password: seed.password ?? null,
      status: seed.status ?? "active",
      weekHours: seed.weekHours ?? 0,
      currentWeekHours: seed.currentWeekHours ?? 0,
      profileVisibility: (seed.profileVisibility ?? "public") as never,
      bio: seed.bio ?? null,
      avatar: seed.avatar ?? null,
      roles: (seed.roles ?? []) as never,
    });
    legacyRepo.store.push(user);
  }
  const legacyModule = createUserManagementModule({
    gateway: new UserServiceGateway(legacyRepo as never, createIdentityAccessModule()),
  });

  const newRepo = new FakeUserRepositoryPort(
    seedUsers.map((seed) => ({
      id: seed.id,
      name: seed.name,
      email: seed.email,
      points: seed.points ?? 0,
      completedTasks: seed.completedTasks ?? 0,
      password: seed.password ?? null,
      status: seed.status ?? "active",
      weekHours: seed.weekHours ?? 0,
      currentWeekHours: seed.currentWeekHours ?? 0,
      profileVisibility: (seed.profileVisibility ?? "public") as never,
      bio: seed.bio ?? null,
      avatar: seed.avatar ?? null,
      roles: (seed.roles ?? []) as never,
    })),
  );
  const newModule = createUserManagementModule({ repository: newRepo, passwordHasher: fakeHasher });

  return { legacyModule, newModule, legacyRepo, newRepo };
}

async function runBoth<T>(
  sides: ReturnType<typeof buildSides>,
  call: (module: ReturnType<typeof createUserManagementModule>) => Promise<T>,
) {
  // Both sides are rebuilt from the pristine seed on EVERY call: mutations from a previous
  // call must not leak into the next comparison (the seed lives in harness.state).
  void sides;
  const legacySides = buildSides(harness.state.users, harness.state.memberships, harness.state.projects);
  const legacy = await call(legacySides.legacyModule).catch((error) => ({ __error: (error as Error).message }));
  const freshSides = buildSides(harness.state.users, harness.state.memberships, harness.state.projects);
  const next = await call(freshSides.newModule).catch((error) => ({ __error: (error as Error).message }));
  return { legacy: norm(legacy), next: norm(next) };
}

const baseSeed: SeedUser[] = [
  { id: 1, name: "Ana", email: "ana@x.com", roles: ["VOLUNTARIO"], points: 10, completedTasks: 2, weekHours: 10, currentWeekHours: 8, bio: "bio-a" },
  { id: 2, name: "Beto", email: "beto@x.com", roles: ["COORDENADOR"], points: 30, completedTasks: 9, bio: "bio-b" },
  { id: 3, name: "Carla", email: "carla@x.com", roles: ["GERENTE_PROJETO"] },
  { id: 4, name: "Pendente", email: "p@x.com", status: "pending" },
];

describe("contract — UserManagement: legacy gateway vs new use-case wiring (R3 parity)", () => {
  beforeEach(() => {
    harness.reset();
  });

  it("createUser happy path (public shape, hashed password)", async () => {
    const sides = buildSides([]);
    const result = await runBoth(sides, (module) =>
      module.createUser({ name: "  Novo  ", email: " NOVO@X.com ", password: "secret123", roles: ["VOLUNTARIO"], weekHours: 5 }),
    );
    expect(result.next).toEqual(result.legacy);
    expect((result.legacy as Record<string, unknown>).email).toBe("novo@x.com");
    expect(result.legacy).not.toHaveProperty("password");
  });

  it("createUser duplicate email -> same message", async () => {
    const sides = buildSides(baseSeed);
    const result = await runBoth(sides, (module) =>
      module.createUser({ name: "Dup", email: "ANA@x.com", password: "secret123", roles: [], weekHours: 0 }),
    );
    expect(result.next).toEqual(result.legacy);
    expect((result.legacy as Record<string, unknown>).__error).toBe("Este email já está em uso");
  });

  it("listUsersForActor: COORDENADOR / VOLUNTARIO / sem permissão", async () => {
    for (const actorRoles of [["COORDENADOR"], ["VOLUNTARIO"], []]) {
      const sides = buildSides(baseSeed);
      const result = await runBoth(sides, (module) => module.listUsersForActor({ actorRoles }));
      expect(result.next, `roles=${actorRoles.join(",")}`).toEqual(result.legacy);
    }
  });

  it("findUserById existing/missing", async () => {
    const sides = buildSides(baseSeed);
    const found = await runBoth(sides, (module) => module.findUserById(1));
    expect(found.next).toEqual(found.legacy);
    expect(found.legacy).not.toHaveProperty("password");

    const missing = await runBoth(sides, (module) => module.findUserById(99));
    expect(missing.next).toEqual(missing.legacy);
  });

  it("updateUser: happy path, duplicate email, invalid avatar", async () => {
    const sides = buildSides(baseSeed);
    const happy = await runBoth(sides, (module) =>
      module.updateUser(1, { name: "  Ana Maria ", email: "novo@x.com", weekHours: "12", roles: ["VOLUNTARIO", "VOLUNTARIO"] }),
    );
    expect(happy.next).toEqual(happy.legacy);

    const dup = await runBoth(sides, (module) => module.updateUser(1, { email: "beto@x.com" }));
    expect(dup.next).toEqual(dup.legacy);
    expect((dup.legacy as Record<string, unknown>).__error).toBe("Email já está em uso");

    const avatar = await runBoth(sides, (module) => module.updateUser(1, { avatar: "https://evil.com/a.png" }));
    expect(avatar.next).toEqual(avatar.legacy);
    expect((avatar.legacy as Record<string, unknown>).__error).toBe("Imagem de perfil inválida");
  });

  it("deleteUser existing/missing", async () => {
    const sides = buildSides(baseSeed);
    const ok = await runBoth(sides, (module) => module.deleteUser(4));
    expect(ok.next).toEqual(ok.legacy);

    const missing = await runBoth(sides, (module) => module.deleteUser(99));
    expect(missing.next).toEqual(missing.legacy);
    expect((missing.legacy as Record<string, unknown>).__error).toBe("Usuário não encontrado");
  });

  it("listPendingUsers + moderatePendingUser approve/reject", async () => {
    const sides = buildSides(baseSeed);
    const list = await runBoth(sides, (module) => module.listPendingUsers());
    expect(list.next).toEqual(list.legacy);

    const approve = await runBoth(sides, (module) => module.moderatePendingUser(4, "approve"));
    expect(approve.next).toEqual(approve.legacy);
    expect((approve.legacy as Record<string, unknown>).status).toBe("active");

    const reject = await runBoth(sides, (module) => module.moderatePendingUser(4, "reject"));
    expect(reject.next).toEqual(reject.legacy);
  });

  it("updateUserProfile: password rules (blank keeps, short rejects, valid hashes)", async () => {
    const sides = buildSides([{ id: 1, name: "Ana", email: "ana@x.com", password: "bcrypt:old" }]);
    const blank = await runBoth(sides, (module) => module.updateUserProfile(1, { password: "   " }));
    expect(blank.next).toEqual(blank.legacy);

    const short = await runBoth(sides, (module) => module.updateUserProfile(1, { password: "short" }));
    expect(short.next).toEqual(short.legacy);
    expect((short.legacy as Record<string, unknown>).__error).toBe("Senha deve ter pelo menos 6 caracteres");

    const changed = await runBoth(sides, (module) => module.updateUserProfile(1, { password: "abc123", bio: "nova" }));
    expect(changed.next).toEqual(changed.legacy);
  });

  it("updateUserPoints: add floor, remove insufficient, set", async () => {
    const sides = buildSides(baseSeed);
    const add = await runBoth(sides, (module) => module.updateUserPoints({ userId: 1, action: "add", points: -50 }));
    expect(add.next).toEqual(add.legacy);
    expect((add.legacy as Record<string, unknown>).points).toBe(0);

    const insufficient = await runBoth(sides, (module) => module.updateUserPoints({ userId: 1, action: "remove", points: 999 }));
    expect(insufficient.next).toEqual(insufficient.legacy);
    expect((insufficient.legacy as Record<string, unknown>).__error).toBe("Usuário não possui pontos suficientes");

    const set = await runBoth(sides, (module) => module.updateUserPoints({ userId: 1, action: "set", points: 42 }));
    expect(set.next).toEqual(set.legacy);
  });

  it("deductUserHours: permission, A4 membership/lead, check order", async () => {
    const noPerm = await runBoth(buildSides(baseSeed), (module) =>
      module.deductUserHours({ userId: 1, hours: 1, reason: "r", deductedBy: 2, deductedByRoles: ["VOLUNTARIO"] }),
    );
    expect(noPerm.next).toEqual(noPerm.legacy);
    expect((noPerm.legacy as Record<string, unknown>).__error).toBe("Sem permissão para retirar horas");

    const happy = await runBoth(buildSides(baseSeed), (module) =>
      module.deductUserHours({ userId: 1, hours: 5, reason: "r", deductedBy: 2, deductedByRoles: ["COORDENADOR"] }),
    );
    expect(happy.next).toEqual(happy.legacy);
    expect((happy.legacy as Record<string, unknown>).message).toBe("5 horas retiradas com sucesso");

    const notMember = await runBoth(
      buildSides(baseSeed, [], [{ id: 7, leaderId: 3 }]),
      (module) => module.deductUserHours({ userId: 1, hours: 1, reason: "r", projectId: 7, deductedBy: 3, deductedByRoles: ["GERENTE_PROJETO"] }),
    );
    expect(notMember.next).toEqual(notMember.legacy);
    expect((notMember.legacy as Record<string, unknown>).__error).toBe("Usuário não pertence ao projeto");

    const actorDenied = await runBoth(
      buildSides(baseSeed, [{ userId: 1, projectId: 7 }], [{ id: 7, leaderId: 99 }]),
      (module) => module.deductUserHours({ userId: 1, hours: 1, reason: "r", projectId: 7, deductedBy: 3, deductedByRoles: ["GERENTE_PROJETO"] }),
    );
    expect(actorDenied.next).toEqual(actorDenied.legacy);
    expect((actorDenied.legacy as Record<string, unknown>).__error).toBe("Acesso negado");

    const order = await runBoth(buildSides(baseSeed), (module) =>
      module.deductUserHours({ userId: 1, hours: -5, reason: "r", deductedBy: 2, deductedByRoles: ["COORDENADOR"] }),
    );
    expect(order.next).toEqual(order.legacy);
    expect((order.legacy as Record<string, unknown>).__error).toBe("Horas não podem ser negativas");
  });

  it("updateUserRoles add/remove/set + updateUserStatus mapping", async () => {
    const sides = buildSides(baseSeed);
    const roles = await runBoth(sides, (module) =>
      module.updateUserRoles({ userId: 1, action: "set", roles: ["GERENTE", "GERENTE", "LABORATORISTA"] as never }),
    );
    expect(roles.next).toEqual(roles.legacy);

    const status = await runBoth(sides, (module) => module.updateUserStatus({ userId: 1, action: "suspend" }));
    expect(status.next).toEqual(status.legacy);
    expect((status.legacy as Record<string, unknown>).status).toBe("suspended");
  });

  it("listUserStatistics roles/status/general + listLeaderboard + listProfiles", async () => {
    const sides = buildSides(baseSeed);
    for (const call of [
      (module: ReturnType<typeof createUserManagementModule>) => module.listUserStatistics("roles"),
      (module: ReturnType<typeof createUserManagementModule>) => module.listUserStatistics("status"),
      (module: ReturnType<typeof createUserManagementModule>) => module.listUserStatistics("general"),
      (module: ReturnType<typeof createUserManagementModule>) => module.listLeaderboard({ type: "points" }),
      (module: ReturnType<typeof createUserManagementModule>) => module.listLeaderboard({ type: "tasks", limit: 1 }),
      (module: ReturnType<typeof createUserManagementModule>) => module.listProfiles({ type: "public" }),
      (module: ReturnType<typeof createUserManagementModule>) => module.listProfiles({ type: "members" }),
    ]) {
      const result = await runBoth(sides, call);
      expect(result.next).toEqual(result.legacy);
    }
  });
});
