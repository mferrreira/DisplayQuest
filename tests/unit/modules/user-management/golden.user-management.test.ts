// @vitest-environment node
/**
 * OND2-B1 (R0) — golden/characterization matrix of `UserServiceGateway` (370 lines) BEFORE
 * the Onda 2 refactor touches it. Frozen behaviors include the documented quirks:
 *
 *   - createUser: email lowercased+trimmed, name trimmed, password hashed (bcrypt seam mocked
 *     deterministically), status forced "active", points/completedTasks/currentWeekHours 0,
 *     profileVisibility "public"; the RETURNED object is `toJSON()` — it has NO password key.
 *   - listUsersForActor: field-level visibility by role (email for COORDENADOR/GERENTE/
 *     GERENTE_PROJETO; bio only for COORDENADOR/GERENTE); active-only; name asc; unknown roles
 *     -> generic permission error.
 *   - updateUser: email duplicate check runs BEFORE the empty-email check; avatar is validated
 *     against the A11 allow-list (null/"" or /uploads/avatars/ or /api/uploads/avatars/).
 *   - updateUserPoints "add" floors at 0 via Math.max; "remove"/"set" reject negative input.
 *   - deductUserHours check ORDER (frozen): currentWeekHours < hours BEFORE hours < 0 BEFORE
 *     weekHours < hours; GERENTE_PROJETO needs projectId, victim membership (A4) and
 *     actor membership-or-leadership.
 *   - listProfiles: BOTH query types call findByProfileVisibility("public") (current quirk).
 *   - UserRepository.findByProfileVisibility returns ALL users (current quirk) — the fake
 *     mirrors it.
 *
 * Seams: `@/lib/database/prisma` (fake in-memory), `bcryptjs` (deterministic fake). The
 * repository is injected as a fake instance (the gateway takes it via constructor).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type UserRow = {
    id: number;
    name: string;
    email: string;
    points: number;
    completedTasks: number;
    password: string | null;
    status: string;
    weekHours: number;
    currentWeekHours: number;
    profileVisibility: string;
    bio: string | null;
    avatar: string | null;
    roles: string[];
  };

  const state = {
    users: [] as UserRow[],
    memberships: [] as Array<{ id: number; userId: number; projectId: number }>,
    projects: [] as Array<{ id: number; leaderId: number }>,
    idSeq: 0,
    calls: [] as Array<{ method: string; args: any }>,
  };

  const prisma = {
    users: {
      findMany: async (args: {
        where?: Record<string, unknown>;
        select?: Record<string, boolean>;
        orderBy?: Record<string, string>;
      }) => {
        state.calls.push({ method: "users.findMany", args });
        let rows = [...state.users];
        if (args.where?.status !== undefined) {
          rows = rows.filter((row) => row.status === args.where!.status);
        }
        if (args.orderBy?.name === "asc") {
          rows.sort((a, b) => a.name.localeCompare(b.name));
        }
        if (args.select) {
          return rows.map((row) => {
            const out: Record<string, unknown> = {};
            for (const [key, selected] of Object.entries(args.select!)) {
              if (selected) out[key] = row[key as keyof UserRow];
            }
            return out;
          });
        }
        return rows;
      },
    },
    project_members: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        state.calls.push({ method: "project_members.findFirst", args });
        const found = state.memberships.find(
          (m) => m.userId === args.where.userId && m.projectId === args.where.projectId,
        );
        return found ? { id: found.id } : null;
      },
    },
    projects: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        state.calls.push({ method: "projects.findFirst", args });
        const found = state.projects.find(
          (p) => p.id === args.where.id && (args.where.leaderId === undefined || p.leaderId === args.where.leaderId),
        );
        return found ? { id: found.id } : null;
      },
    },
  };

  const bcryptFake = {
    hash: async (value: string) => `bcrypt:${value}`,
    compare: async (value: string, hashed: string) => hashed === `bcrypt:${value}`,
  };

  function reset() {
    state.users = [];
    state.memberships = [];
    state.projects = [];
    state.idSeq = 0;
    state.calls = [];
  }

  function seedUser(partial: Partial<UserRow> & { id: number; email: string }) {
    state.users.push({
      name: `User ${partial.id}`,
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
      ...partial,
    });
  }

  function seedMembership(userId: number, projectId: number) {
    state.memberships.push({ id: ++state.idSeq, userId, projectId });
  }

  function seedProject(id: number, leaderId: number) {
    state.projects.push({ id, leaderId });
  }

  return { state, prisma, bcryptFake, reset, seedUser, seedMembership, seedProject };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: harness.prisma }));
vi.mock("bcryptjs", () => ({
  default: harness.bcryptFake,
  hash: harness.bcryptFake.hash,
  compare: harness.bcryptFake.compare,
}));

import { User } from "@/backend/models/user/User";
import { UserServiceGateway } from "@/backend/modules/user-management/infrastructure/user-service.gateway";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";

/**
 * Fake repository mirroring `backend/repositories/UserRepository` semantics used by the
 * gateway — including its current quirks (findByProfileVisibility returns ALL users).
 * Instances are cloned on read/write like the real Prisma-backed repo does.
 */
class FakeUserRepository {
  store: User[] = [];
  private nextId = 1;

  private clone(user: User): User {
    return new User(user);
  }

  async findById(id: number): Promise<User | null> {
    const found = this.store.find((user) => user.id === id);
    return found ? this.clone(found) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const found = this.store.find((user) => user.email === email.toLowerCase());
    return found ? this.clone(found) : null;
  }

  async create(user: User): Promise<User> {
    const stored = this.clone(user);
    stored.id = this.nextId++;
    this.store.push(stored);
    return this.clone(stored);
  }

  async update(user: User): Promise<User> {
    if (!user.id) throw new Error("User ID é obrigatório para atualização");
    const index = this.store.findIndex((stored) => stored.id === user.id);
    if (index === -1) throw new Error("User não encontrado");
    this.store[index] = this.clone(user);
    return this.clone(this.store[index]);
  }

  async delete(id: number): Promise<void> {
    this.store = this.store.filter((user) => user.id !== id);
  }

  async findPending(): Promise<User[]> {
    return this.store.filter((user) => user.status === "pending").map((user) => this.clone(user));
  }

  async findTopByPoints(limit = 10): Promise<User[]> {
    return [...this.store]
      .filter((user) => user.status === "active")
      .sort((a, b) => b.points - a.points)
      .slice(0, limit)
      .map((user) => this.clone(user));
  }

  async findTopByTasks(limit = 10): Promise<User[]> {
    return [...this.store]
      .filter((user) => user.status === "active")
      .sort((a, b) => b.completedTasks - a.completedTasks)
      .slice(0, limit)
      .map((user) => this.clone(user));
  }

  async findByProfileVisibility(_visibility: string): Promise<User[]> {
    // frozen quirk: the real repo returns ALL users regardless of visibility
    return this.store.map((user) => this.clone(user));
  }

  async getUsersByRole(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const user of this.store) {
      for (const role of user.roles) counts[role] = (counts[role] ?? 0) + 1;
    }
    return counts;
  }

  async getUsersByStatus(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const user of this.store) {
      counts[user.status] = (counts[user.status] ?? 0) + 1;
    }
    return counts;
  }

  async getUserStatistics() {
    const total = this.store.length;
    return {
      total,
      active: this.store.filter((u) => u.status === "active").length,
      pending: this.store.filter((u) => u.status === "pending").length,
      totalPoints: this.store.reduce((sum, u) => sum + u.points, 0),
    };
  }
}

function makeGateway() {
  const repository = new FakeUserRepository();
  const gateway = new UserServiceGateway(
    repository as never,
    createIdentityAccessModule(),
  );
  return { gateway, repository };
}

beforeEach(() => {
  harness.reset();
});

describe("golden — createUser", () => {
  it("validates name/email/password with the current messages", async () => {
    const { gateway } = makeGateway();
    await expect(
      gateway.createUser({ name: "", email: "a@x.com", password: "secret123", roles: [], weekHours: 0 }),
    ).rejects.toThrow("Nome é obrigatório");
    await expect(
      gateway.createUser({ name: "N", email: " ", password: "secret123", roles: [], weekHours: 0 }),
    ).rejects.toThrow("Email é obrigatório");
    await expect(
      gateway.createUser({ name: "N", email: "a@x.com", password: "12345", roles: [], weekHours: 0 }),
    ).rejects.toThrow("A senha deve ter pelo menos 6 caracteres");
  });

  it("rejects duplicate email (case-insensitive via normalization)", async () => {
    const { gateway, repository } = makeGateway();
    await gateway.createUser({ name: "Ana", email: "ana@x.com", password: "secret123", roles: [], weekHours: 0 });
    await expect(
      gateway.createUser({ name: "Outra", email: "ANA@x.com", password: "secret123", roles: [], weekHours: 0 }),
    ).rejects.toThrow("Este email já está em uso");
    expect(repository.store).toHaveLength(1);
  });

  it("normalizes, forces defaults, hashes the password and returns toJSON WITHOUT password", async () => {
    const { gateway, repository } = makeGateway();
    const created = (await gateway.createUser({
      name: "  Ana  ",
      email: "  ANA@X.com ",
      password: "secret123",
      roles: ["VOLUNTARIO"],
      weekHours: 10,
    })) as Record<string, unknown>;

    expect(created).not.toHaveProperty("password");
    expect(created.name).toBe("Ana");
    expect(created.email).toBe("ana@x.com");
    expect(created.status).toBe("active");
    expect(created.points).toBe(0);
    expect(created.completedTasks).toBe(0);
    expect(created.currentWeekHours).toBe(0);
    expect(created.profileVisibility).toBe("public");
    expect(created.roles).toEqual(["VOLUNTARIO"]);

    const stored = repository.store[0];
    expect(stored.password).toBe("bcrypt:secret123");
    expect(stored.name).toBe("Ana");
    expect(stored.email).toBe("ana@x.com");
    expect(stored.weekHours).toBe(10);
  });

  it("undefined roles -> []", async () => {
    const { gateway, repository } = makeGateway();
    await gateway.createUser({
      name: "Ana",
      email: "ana@x.com",
      password: "secret123",
      roles: undefined as never,
      weekHours: 0,
    });
    expect(repository.store[0].roles).toEqual([]);
  });
});

describe("golden — listUsersForActor (field-level visibility)", () => {
  beforeEach(() => {
    harness.seedUser({ id: 1, name: "Zeta", email: "z@x.com", roles: ["VOLUNTARIO"], bio: "bio-z" });
    harness.seedUser({ id: 2, name: "Ana", email: "a@x.com", roles: ["COORDENADOR"], bio: "bio-a" });
    harness.seedUser({ id: 3, name: "Beto", email: "b@x.com", roles: ["GERENTE_PROJETO"], bio: "bio-b" });
    harness.seedUser({ id: 4, name: "Inativo", email: "i@x.com", status: "pending" });
  });

  it("roles without basic-view permission -> permission error", async () => {
    const { gateway } = makeGateway();
    await expect(gateway.listUsersForActor({ actorRoles: [] })).rejects.toThrow(
      "Usuário não tem permissão para visualizar outros usuários",
    );
  });

  it("COORDENADOR sees email + bio; active-only; name asc", async () => {
    const { gateway } = makeGateway();
    const rows = (await gateway.listUsersForActor({ actorRoles: ["COORDENADOR"] })) as Array<
      Record<string, unknown>
    >;
    expect(rows.map((row) => row.id)).toEqual([2, 3, 1]);
    expect(rows[0]).toEqual({
      id: 2,
      name: "Ana",
      email: "a@x.com",
      roles: ["COORDENADOR"],
      status: "active",
      weekHours: 0,
      points: 0,
      completedTasks: 0,
      avatar: null,
      bio: "bio-a",
    });
  });

  it("GERENTE_PROJETO sees email but NOT bio", async () => {
    const { gateway } = makeGateway();
    const rows = (await gateway.listUsersForActor({ actorRoles: ["GERENTE_PROJETO"] })) as Array<
      Record<string, unknown>
    >;
    expect(rows[0].email).toBe("a@x.com");
    expect(rows[0]).not.toHaveProperty("bio");
  });

  it("VOLUNTARIO sees neither email nor bio", async () => {
    const { gateway } = makeGateway();
    const rows = (await gateway.listUsersForActor({ actorRoles: ["VOLUNTARIO"] })) as Array<
      Record<string, unknown>
    >;
    expect(rows[0]).not.toHaveProperty("email");
    expect(rows[0]).not.toHaveProperty("bio");
    expect(rows[0]).toHaveProperty("name");
  });
});

describe("golden — updateUser", () => {
  it("missing user -> 'Usuário não encontrado'", async () => {
    const { gateway } = makeGateway();
    await expect(gateway.updateUser(99, { name: "X" })).rejects.toThrow("Usuário não encontrado");
  });

  it("empty name -> 'Nome é obrigatório'", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active" }));
    await expect(gateway.updateUser(1, { name: "   " })).rejects.toThrow("Nome é obrigatório");
  });

  it("email duplicate check runs BEFORE the empty-email check; email is lowercased", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active" }));
    await repository.create(new User({ name: "Beto", email: "beto@x.com", status: "active" }));

    await expect(gateway.updateUser(1, { email: "beto@x.com" })).rejects.toThrow("Email já está em uso");
    await expect(gateway.updateUser(1, { email: "" })).rejects.toThrow("Email inválido");

    const updated = (await gateway.updateUser(1, { email: "  NOVO@X.com  " })) as User;
    expect(updated.email).toBe("novo@x.com");
  });

  it("avatar A11 allow-list: internal prefixes pass; external/traversal/no-slash are rejected; null/'' -> null", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active" }));

    let updated = (await gateway.updateUser(1, { avatar: "/uploads/avatars/a.png" })) as User;
    expect(updated.avatar).toBe("/uploads/avatars/a.png");

    updated = (await gateway.updateUser(1, { avatar: "/api/uploads/avatars/b.png" })) as User;
    expect(updated.avatar).toBe("/api/uploads/avatars/b.png");

    updated = (await gateway.updateUser(1, { avatar: null })) as User;
    expect(updated.avatar).toBeNull();
    updated = (await gateway.updateUser(1, { avatar: "" })) as User;
    expect(updated.avatar).toBeNull();

    await expect(gateway.updateUser(1, { avatar: "https://evil.com/a.png" })).rejects.toThrow(
      "Imagem de perfil inválida",
    );
    await expect(gateway.updateUser(1, { avatar: "uploads/avatars/x.png" })).rejects.toThrow(
      "Imagem de perfil inválida",
    );
    await expect(gateway.updateUser(1, { avatar: "/uploads/avatars/../secret" })).rejects.toThrow(
      "Imagem de perfil inválida",
    );
  });

  it("roles are deduped; weekHours coerced to Number; empty bio -> null", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", bio: "velha" }));

    const updated = (await gateway.updateUser(1, {
      roles: ["VOLUNTARIO", "VOLUNTARIO", "PESQUISADOR"],
      weekHours: "8",
      bio: "",
    })) as User;

    expect(updated.roles).toEqual(["VOLUNTARIO", "PESQUISADOR"]);
    expect(updated.weekHours).toBe(8);
    expect(updated.bio).toBeNull();
  });
});

describe("golden — deleteUser / listPendingUsers / moderatePendingUser", () => {
  it("deleteUser: missing -> error; existing -> removed", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active" }));
    await gateway.deleteUser(1);
    expect(repository.store).toHaveLength(0);
    await expect(gateway.deleteUser(1)).rejects.toThrow("Usuário não encontrado");
  });

  it("listPendingUsers returns only status=pending", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "pending" }));
    await repository.create(new User({ name: "Beto", email: "beto@x.com", status: "active" }));
    const pending = (await gateway.listPendingUsers()) as User[];
    expect(pending.map((user) => user.email)).toEqual(["ana@x.com"]);
  });

  it("moderatePendingUser approve -> status active; reject -> user deleted; missing -> error", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "pending" }));
    await repository.create(new User({ name: "Beto", email: "beto@x.com", status: "pending" }));

    const approved = (await gateway.moderatePendingUser(1, "approve")) as User;
    expect(approved.status).toBe("active");

    await gateway.moderatePendingUser(2, "reject");
    expect(repository.store.find((user) => user.id === 2)).toBeUndefined();

    await expect(gateway.moderatePendingUser(99, "approve")).rejects.toThrow("Usuário não encontrado");
  });
});

describe("golden — updateUserProfile", () => {
  it("missing -> error; password set only when non-blank; short password rejected", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", password: "bcrypt:old" }));

    const kept = (await gateway.updateUserProfile(1, { password: "   " })) as User;
    expect(kept.password).toBe("bcrypt:old");

    const changed = (await gateway.updateUserProfile(1, { password: "abc123" })) as User;
    expect(changed.password).toBe("bcrypt:abc123");

    await expect(gateway.updateUserProfile(1, { password: "short" })).rejects.toThrow(
      "Senha deve ter pelo menos 6 caracteres",
    );
  });

  it("name/bio/avatar/visibility/weekHours updates mirror updateUser rules", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active" }));
    const updated = (await gateway.updateUserProfile(1, {
      name: "  Ana Maria ",
      bio: "nova",
      avatar: "/uploads/avatars/a.png",
      profileVisibility: "private",
      weekHours: 6,
    })) as User;
    expect(updated.name).toBe("Ana Maria");
    expect(updated.bio).toBe("nova");
    expect(updated.avatar).toBe("/uploads/avatars/a.png");
    expect(updated.profileVisibility).toBe("private");
    expect(updated.weekHours).toBe(6);
  });
});

describe("golden — updateUserPoints", () => {
  async function seeded(points: number) {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", points }));
    return { gateway, repository };
  }

  it("add: sums; negative add floors at 0 (Math.max)", async () => {
    const { gateway } = await seeded(10);
    expect(((await gateway.updateUserPoints({ userId: 1, action: "add", points: 5 })) as User).points).toBe(15);
    expect(((await gateway.updateUserPoints({ userId: 1, action: "add", points: -50 })) as User).points).toBe(0);
  });

  it("remove: subtracts; negative input rejected; insufficient rejected", async () => {
    const { gateway } = await seeded(10);
    expect(((await gateway.updateUserPoints({ userId: 1, action: "remove", points: 3 })) as User).points).toBe(7);
    await expect(gateway.updateUserPoints({ userId: 1, action: "remove", points: -1 })).rejects.toThrow(
      "Pontos não podem ser negativos",
    );
    await expect(gateway.updateUserPoints({ userId: 1, action: "remove", points: 999 })).rejects.toThrow(
      "Usuário não possui pontos suficientes",
    );
  });

  it("set: assigns; negative rejected", async () => {
    const { gateway } = await seeded(10);
    expect(((await gateway.updateUserPoints({ userId: 1, action: "set", points: 42 })) as User).points).toBe(42);
    await expect(gateway.updateUserPoints({ userId: 1, action: "set", points: -5 })).rejects.toThrow(
      "Pontos não podem ser negativos",
    );
  });

  it("missing user -> 'Usuário não encontrado'", async () => {
    const { gateway } = await seeded(10);
    await expect(gateway.updateUserPoints({ userId: 99, action: "add", points: 1 })).rejects.toThrow(
      "Usuário não encontrado",
    );
  });
});

describe("golden — deductUserHours (authorization + check order)", () => {
  it("missing user -> 'Usuário não encontrado'", async () => {
    const { gateway } = makeGateway();
    await expect(
      gateway.deductUserHours({ userId: 99, hours: 1, reason: "r", deductedBy: 1, deductedByRoles: ["COORDENADOR"] }),
    ).rejects.toThrow("Usuário não encontrado");
  });

  it("roles without MANAGE_USERS and without GERENTE_PROJETO+projectId -> 'Sem permissão para retirar horas'", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", weekHours: 10, currentWeekHours: 10 }));
    await expect(
      gateway.deductUserHours({ userId: 1, hours: 1, reason: "r", deductedBy: 2, deductedByRoles: ["VOLUNTARIO"] }),
    ).rejects.toThrow("Sem permissão para retirar horas");
  });

  it("COORDENADOR (MANAGE_USERS) deducts without project checks", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", weekHours: 10, currentWeekHours: 8 }));
    const result = (await gateway.deductUserHours({
      userId: 1,
      hours: 5,
      reason: "r",
      deductedBy: 2,
      deductedByRoles: ["COORDENADOR"],
    })) as { message: string; user: User };
    expect(result.message).toBe("5 horas retiradas com sucesso");
    expect(result.user.weekHours).toBe(5);
    expect(result.user.currentWeekHours).toBe(5); // clamped to weekHours
  });

  it("GERENTE_PROJETO without projectId -> 'Sem permissão para retirar horas'", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", weekHours: 10, currentWeekHours: 10 }));
    await expect(
      gateway.deductUserHours({ userId: 1, hours: 1, reason: "r", deductedBy: 2, deductedByRoles: ["GERENTE_PROJETO"] }),
    ).rejects.toThrow("Sem permissão para retirar horas");
  });

  it("GERENTE_PROJETO: victim must belong to the project (A4)", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", weekHours: 10, currentWeekHours: 10 }));
    harness.seedProject(7, 2); // actor leads the project, but victim is NOT a member
    await expect(
      gateway.deductUserHours({ userId: 1, hours: 1, reason: "r", projectId: 7, deductedBy: 2, deductedByRoles: ["GERENTE_PROJETO"] }),
    ).rejects.toThrow("Usuário não pertence ao projeto");
  });

  it("GERENTE_PROJETO: actor must be member OR leader of the project (A4)", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", weekHours: 10, currentWeekHours: 10 }));
    harness.seedMembership(1, 7); // victim is a member
    harness.seedProject(7, 99); // actor 2 is neither member nor leader
    await expect(
      gateway.deductUserHours({ userId: 1, hours: 1, reason: "r", projectId: 7, deductedBy: 2, deductedByRoles: ["GERENTE_PROJETO"] }),
    ).rejects.toThrow("Acesso negado");

    harness.seedMembership(2, 7); // actor becomes a member -> allowed
    const result = (await gateway.deductUserHours({
      userId: 1,
      hours: 4,
      reason: "r",
      projectId: 7,
      deductedBy: 2,
      deductedByRoles: ["GERENTE_PROJETO"],
    })) as { message: string };
    expect(result.message).toBe("4 horas retiradas com sucesso");
  });

  it("GERENTE_PROJETO leader (not member) is allowed (A4)", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", weekHours: 10, currentWeekHours: 10 }));
    harness.seedMembership(1, 7);
    harness.seedProject(7, 2); // actor leads
    const result = (await gateway.deductUserHours({
      userId: 1,
      hours: 2,
      reason: "r",
      projectId: 7,
      deductedBy: 2,
      deductedByRoles: ["GERENTE_PROJETO"],
    })) as { message: string };
    expect(result.message).toBe("2 horas retiradas com sucesso");
  });

  it("frozen check order: currentWeekHours BEFORE hours<0 BEFORE weekHours", async () => {
    const { gateway, repository } = makeGateway();
    // currentWeekHours 10 < 20 -> first error even though weekHours is also insufficient
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", weekHours: 5, currentWeekHours: 10 }));
    await expect(
      gateway.deductUserHours({ userId: 1, hours: 20, reason: "r", deductedBy: 2, deductedByRoles: ["COORDENADOR"] }),
    ).rejects.toThrow("Usuário não possui horas suficientes");

    // hours negative passes the currentWeekHours check (10 < -5 is false) -> hits the negative rule
    await expect(
      gateway.deductUserHours({ userId: 1, hours: -5, reason: "r", deductedBy: 2, deductedByRoles: ["COORDENADOR"] }),
    ).rejects.toThrow("Horas não podem ser negativas");

    // currentWeekHours sufficient but weekHours insufficient -> second "insufficient"
    await repository.update(new User({ id: 1, name: "Ana", email: "ana@x.com", status: "active", weekHours: 3, currentWeekHours: 10 }));
    await expect(
      gateway.deductUserHours({ userId: 1, hours: 5, reason: "r", deductedBy: 2, deductedByRoles: ["COORDENADOR"] }),
    ).rejects.toThrow("Usuário não possui horas suficientes");
  });
});

describe("golden — updateUserRoles / updateUserStatus", () => {
  it("roles add appends only when absent; remove filters; set replaces deduped", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", roles: ["VOLUNTARIO"] }));

    let updated = (await gateway.updateUserRoles({ userId: 1, action: "add", role: "PESQUISADOR" as never })) as User;
    expect(updated.roles).toEqual(["VOLUNTARIO", "PESQUISADOR"]);

    updated = (await gateway.updateUserRoles({ userId: 1, action: "add", role: "VOLUNTARIO" as never })) as User;
    expect(updated.roles).toEqual(["VOLUNTARIO", "PESQUISADOR"]);

    updated = (await gateway.updateUserRoles({ userId: 1, action: "remove", role: "VOLUNTARIO" as never })) as User;
    expect(updated.roles).toEqual(["PESQUISADOR"]);

    updated = (await gateway.updateUserRoles({
      userId: 1,
      action: "set",
      roles: ["GERENTE", "GERENTE", "LABORATORISTA"] as never,
    })) as User;
    expect(updated.roles).toEqual(["GERENTE", "LABORATORISTA"]);
  });

  it("status approve->active, reject->rejected, suspend->suspended, anything else->active", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "pending" }));

    expect(((await gateway.updateUserStatus({ userId: 1, action: "approve" })) as User).status).toBe("active");
    expect(((await gateway.updateUserStatus({ userId: 1, action: "reject" })) as User).status).toBe("rejected");
    expect(((await gateway.updateUserStatus({ userId: 1, action: "suspend" })) as User).status).toBe("suspended");
    expect(((await gateway.updateUserStatus({ userId: 1, action: "activate" })) as User).status).toBe("active");
    expect(((await gateway.updateUserStatus({ userId: 1, action: "estranho" as never })) as User).status).toBe("active");
  });
});

describe("golden — statistics / leaderboard / profiles", () => {
  it("listUserStatistics dispatches by type (roles/status/general/default)", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", roles: ["VOLUNTARIO"], points: 10 }));
    await repository.create(new User({ name: "Beto", email: "beto@x.com", status: "pending", points: 20 }));

    expect(await gateway.listUserStatistics("roles")).toEqual({ VOLUNTARIO: 1 });
    expect(await gateway.listUserStatistics("status")).toEqual({ active: 1, pending: 1 });
    expect(await gateway.listUserStatistics("general")).toEqual({ total: 2, active: 1, pending: 1, totalPoints: 30 });
    expect(await gateway.listUserStatistics(null)).toEqual({ total: 2, active: 1, pending: 1, totalPoints: 30 });
  });

  it("listLeaderboard: tasks -> top by completedTasks; default points; limit defaults to 10", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", points: 10, completedTasks: 1 }));
    await repository.create(new User({ name: "Beto", email: "beto@x.com", status: "active", points: 30, completedTasks: 9 }));
    await repository.create(new User({ name: "Pending", email: "p@x.com", status: "pending", points: 999 }));

    const byTasks = (await gateway.listLeaderboard({ type: "tasks" })) as User[];
    expect(byTasks.map((user) => user.name)).toEqual(["Beto", "Ana"]);

    const byPoints = (await gateway.listLeaderboard({ type: "points" })) as User[];
    expect(byPoints.map((user) => user.name)).toEqual(["Beto", "Ana"]); // pending excluded

    const limited = (await gateway.listLeaderboard({ type: "points", limit: 1 })) as User[];
    expect(limited).toHaveLength(1);
  });

  it("listProfiles: BOTH 'public' and 'members' call findByProfileVisibility('public') (quirk)", async () => {
    const { gateway, repository } = makeGateway();
    await repository.create(new User({ name: "Ana", email: "ana@x.com", status: "active", profileVisibility: "private" as never }));

    const publicProfiles = (await gateway.listProfiles({ type: "public" })) as User[];
    const memberProfiles = (await gateway.listProfiles({ type: "members" })) as User[];
    expect(publicProfiles.map((user) => user.name)).toEqual(["Ana"]);
    expect(memberProfiles.map((user) => user.name)).toEqual(["Ana"]); // same call today
  });
});
