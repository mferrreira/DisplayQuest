// @vitest-environment node
/**
 * OND2-B2 (R2) — unit tests of the NEW user-management use cases over fake ports.
 *
 * Unlike the golden/contract suites (which freeze the legacy gateway), these tests assert the
 * EVOLVED contract: the same frozen messages now arrive as typed DomainErrors with stable
 * status/code (AC-00-07), ready for the route mapping in OND2-B3. No prisma/bcrypt mocks:
 * the use cases only see `UserRepositoryPort`/`PasswordHasher`.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/backend/domain";
import { CreateUserUseCase } from "@/backend/modules/user-management/application/use-cases/create-user.use-case";
import { DeleteUserUseCase } from "@/backend/modules/user-management/application/use-cases/delete-user.use-case";
import { DeductUserHoursUseCase } from "@/backend/modules/user-management/application/use-cases/deduct-user-hours.use-case";
import { FindUserByIdUseCase } from "@/backend/modules/user-management/application/use-cases/find-user-by-id.use-case";
import { ListLeaderboardUseCase } from "@/backend/modules/user-management/application/use-cases/list-leaderboard.use-case";
import { ListPendingUsersUseCase } from "@/backend/modules/user-management/application/use-cases/list-pending-users.use-case";
import { ListProfilesUseCase } from "@/backend/modules/user-management/application/use-cases/list-profiles.use-case";
import { ListUserStatisticsUseCase } from "@/backend/modules/user-management/application/use-cases/list-user-statistics.use-case";
import { ListUsersForActorUseCase } from "@/backend/modules/user-management/application/use-cases/list-users-for-actor.use-case";
import { ModeratePendingUserUseCase } from "@/backend/modules/user-management/application/use-cases/moderate-pending-user.use-case";
import { RegisterUserUseCase } from "@/backend/modules/user-management/application/use-cases/register-user.use-case";
import { UpdateUserUseCase } from "@/backend/modules/user-management/application/use-cases/update-user.use-case";
import { UpdateUserPointsUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-points.use-case";
import { UpdateUserProfileUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-profile.use-case";
import { UpdateUserRolesUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-roles.use-case";
import { UpdateUserStatusUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-status.use-case";
import type { PasswordHasher } from "@/backend/modules/user-management/application/ports/password-hasher";
import type { UserRecord, UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository";

class FakeRepository implements UserRepositoryPort {
  store: UserRecord[] = [];
  memberships: Array<{ userId: number; projectId: number }> = [];
  projects: Array<{ id: number; leaderId: number }> = [];
  visibilityCalls: string[] = [];
  private nextId = 1;

  seed(users: Array<Partial<UserRecord> & { id: number }>): void {
    this.store = users.map((row) => ({
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
    })) as UserRecord[];
    this.nextId = Math.max(...users.map((u) => u.id), 0) + 1;
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
    this.store[this.store.findIndex((u) => u.id === record.id)] = this.clone(record);
    return this.clone(record);
  }
  async delete(id: number) {
    this.store = this.store.filter((u) => u.id !== id);
  }
  /** V4-1 (DEC-55): 0 por default — nenhum usuário desta suíte tem dependência. */
  async countBlockingDependencies() {
    return 0;
  }
  async findPending() {
    return this.store.filter((u) => u.status === "pending").map((u) => this.clone(u));
  }
  async findActiveUsers() {
    return this.store
      .filter((u) => u.status === "active")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => this.clone(u));
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
  async findByProfileVisibility(visibility: "public" | "members_only" | "private") {
    this.visibilityCalls.push(visibility);
    return this.store.map((u) => this.clone(u)); // frozen quirk: all users
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
    return { total: this.store.length } as never;
  }
  async isProjectMember(userId: number, projectId?: number) {
    return this.memberships.some((m) => m.userId === userId && (projectId === undefined || m.projectId === projectId));
  }
  async leadsProject(userId: number, projectId?: number) {
    return this.projects.some((p) => (projectId === undefined || p.id === projectId) && p.leaderId === userId);
  }
}

const hasherCalls: Array<{ plain: string; rounds: number }> = [];
const fakeHasher: PasswordHasher = {
  async hash(plain: string, rounds: number) {
    hasherCalls.push({ plain, rounds });
    return `bcrypt:${plain}`;
  },
};

let repository: FakeRepository;

beforeEach(() => {
  repository = new FakeRepository();
  repository.seed([
    { id: 1, name: "Ana", email: "ana@x.com", roles: ["VOLUNTARIO"], points: 10, weekHours: 10, currentWeekHours: 8, bio: "bio-a" },
    { id: 2, name: "Beto", email: "beto@x.com", roles: ["COORDENADOR"], points: 30, bio: "bio-b" },
    { id: 3, name: "Carla", email: "carla@x.com", roles: ["GERENTE_PROJETO"] },
    { id: 4, name: "Pendente", email: "p@x.com", status: "pending" },
  ]);
  repository.memberships = [];
  repository.projects = [];
  hasherCalls.length = 0;
});

describe("CreateUserUseCase", () => {
  const useCase = () => new CreateUserUseCase(repository, fakeHasher);

  it("typed validation errors (400) with the frozen messages", async () => {
    await expect(useCase().execute({ name: "", email: "a@x.com", password: "secret123", roles: [], weekHours: 0 }))
      .rejects.toMatchObject({ name: "ValidationError", status: 400, code: "VALIDATION_ERROR", message: "Nome é obrigatório" });
    await expect(useCase().execute({ name: "N", email: " ", password: "secret123", roles: [], weekHours: 0 }))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(useCase().execute({ name: "N", email: "a@x.com", password: "12345", roles: [], weekHours: 0 }))
      .rejects.toThrow("A senha deve ter pelo menos 6 caracteres");
  });

  it("duplicate email -> ConflictError (409)", async () => {
    await expect(
      useCase().execute({ name: "Dup", email: "ANA@x.com", password: "secret123", roles: [], weekHours: 0 }),
    ).rejects.toMatchObject({ name: "ConflictError", status: 409, message: "Este email já está em uso" });
  });

  it("happy path: public shape, no password, hash cost 12", async () => {
    const created = (await useCase().execute({
      name: "  Novo  ",
      email: " NOVO@X.com ",
      password: "secret123",
      roles: ["VOLUNTARIO"],
      weekHours: 5,
    })) as unknown as Record<string, unknown>;

    expect(created).not.toHaveProperty("password");
    expect(created.email).toBe("novo@x.com");
    expect(created.name).toBe("Novo");
    expect(created.status).toBe("active");
    expect(hasherCalls).toEqual([{ plain: "secret123", rounds: 12 }]);
    expect(repository.store.find((u) => u.email === "novo@x.com")?.password).toBe("bcrypt:secret123");
  });
});

describe("ListUsersForActorUseCase", () => {
  const useCase = () => new ListUsersForActorUseCase(repository);

  it("no basic-view role -> ForbiddenError (403) with the frozen message", async () => {
    await expect(useCase().execute({ actorRoles: [] })).rejects.toMatchObject({
      name: "ForbiddenError",
      status: 403,
      message: "Usuário não tem permissão para visualizar outros usuários",
    });
  });

  it("field-level visibility: COORDENADOR email+bio, GERENTE_PROJETO email only, VOLUNTARIO neither", async () => {
    const full = (await useCase().execute({ actorRoles: ["COORDENADOR"] })) as Array<Record<string, unknown>>;
    expect(full[0]).toHaveProperty("email");
    expect(full[0]).toHaveProperty("bio");

    const project = (await useCase().execute({ actorRoles: ["GERENTE_PROJETO"] })) as Array<Record<string, unknown>>;
    expect(project[0]).toHaveProperty("email");
    expect(project[0]).not.toHaveProperty("bio");

    const basic = (await useCase().execute({ actorRoles: ["VOLUNTARIO"] })) as Array<Record<string, unknown>>;
    expect(basic[0]).not.toHaveProperty("email");
    expect(basic[0]).not.toHaveProperty("bio");
  });
});

describe("FindUserById / Delete / ListPending", () => {
  it("findUserById returns the public shape (no password)", async () => {
    repository.store[0].password = "bcrypt:x";
    const user = (await new FindUserByIdUseCase(repository).execute(1)) as unknown as Record<string, unknown>;
    expect(user).not.toHaveProperty("password");
    expect(await new FindUserByIdUseCase(repository).execute(99)).toBeNull();
  });

  it("deleteUser missing -> NotFoundError (404)", async () => {
    await expect(new DeleteUserUseCase(repository).execute(99)).rejects.toMatchObject({
      name: "NotFoundError",
      status: 404,
      message: "Usuário não encontrado",
    });
    await new DeleteUserUseCase(repository).execute(4);
    expect(repository.store.find((u) => u.id === 4)).toBeUndefined();
  });

  it("listPendingUsers only pending", async () => {
    const pending = (await new ListPendingUsersUseCase(repository).execute()) as unknown as Array<Record<string, unknown>>;
    expect(pending.map((u) => u.email)).toEqual(["p@x.com"]);
  });
});

describe("UpdateUserUseCase", () => {
  const useCase = () => new UpdateUserUseCase(repository);

  it("missing -> NotFoundError; duplicate email -> ConflictError; empty email -> ValidationError", async () => {
    await expect(useCase().execute(99, { name: "X" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(useCase().execute(1, { email: "beto@x.com" })).rejects.toMatchObject({
      name: "ConflictError",
      message: "Email já está em uso",
    });
    await expect(useCase().execute(1, { email: "" })).rejects.toMatchObject({
      name: "ValidationError",
      message: "Email inválido",
    });
  });

  it("invalid avatar -> ValidationError from the pure domain policy", async () => {
    await expect(useCase().execute(1, { avatar: "https://evil.com/a.png" })).rejects.toMatchObject({
      name: "ValidationError",
      status: 400,
      message: "Imagem de perfil inválida",
    });
  });

  it("happy path: name trimmed, email lowercased, roles deduped, output has no password", async () => {
    repository.store[0].password = "bcrypt:x";
    const updated = (await useCase().execute(1, {
      name: "  Ana Maria ",
      email: " NOVO@X.com ",
      roles: ["VOLUNTARIO", "PESQUISADOR", "VOLUNTARIO"],
    })) as unknown as Record<string, unknown>;
    expect(updated.name).toBe("Ana Maria");
    expect(updated.email).toBe("novo@x.com");
    expect(updated.roles).toEqual(["VOLUNTARIO", "PESQUISADOR"]);
    expect(updated).not.toHaveProperty("password");
  });
});

describe("UpdateUserProfileUseCase", () => {
  const useCase = () => new UpdateUserProfileUseCase(repository, fakeHasher);

  it("blank password keeps the old hash; valid password hashes with cost 10; short -> ValidationError", async () => {
    repository.store[0].password = "bcrypt:old";

    await useCase().execute(1, { password: "   " });
    expect(repository.store[0].password).toBe("bcrypt:old");
    expect(hasherCalls).toHaveLength(0);

    await useCase().execute(1, { password: "abc123" });
    expect(repository.store[0].password).toBe("bcrypt:abc123");
    expect(hasherCalls).toEqual([{ plain: "abc123", rounds: 10 }]);

    await expect(useCase().execute(1, { password: "short" })).rejects.toMatchObject({
      name: "ValidationError",
      message: "Senha deve ter pelo menos 6 caracteres",
    });
  });
});

describe("UpdateUserPointsUseCase", () => {
  const useCase = () => new UpdateUserPointsUseCase(repository);

  it("add floors at 0; remove rejects negative/insufficient (ValidationError); set assigns", async () => {
    expect(((await useCase().execute({ userId: 1, action: "add", points: -50 })) as { points: number }).points).toBe(0);
    await expect(useCase().execute({ userId: 1, action: "remove", points: -1 })).rejects.toMatchObject({
      name: "ValidationError",
      message: "Pontos não podem ser negativos",
    });
    await expect(useCase().execute({ userId: 1, action: "remove", points: 999 })).rejects.toMatchObject({
      name: "ValidationError",
      message: "Usuário não possui pontos suficientes",
    });
    expect(((await useCase().execute({ userId: 1, action: "set", points: 42 })) as { points: number }).points).toBe(42);
  });
});

describe("DeductUserHoursUseCase", () => {
  const useCase = () => new DeductUserHoursUseCase(repository);

  it("no permission -> ForbiddenError (403)", async () => {
    await expect(
      useCase().execute({ userId: 1, hours: 1, reason: "r", deductedBy: 2, deductedByRoles: ["VOLUNTARIO"] }),
    ).rejects.toMatchObject({ name: "ForbiddenError", status: 403, message: "Sem permissão para retirar horas" });
  });

  it("A4: victim membership and actor membership-or-lead enforced for GERENTE_PROJETO", async () => {
    repository.projects = [{ id: 7, leaderId: 3 }];
    await expect(
      useCase().execute({ userId: 1, hours: 1, reason: "r", projectId: 7, deductedBy: 3, deductedByRoles: ["GERENTE_PROJETO"] }),
    ).rejects.toMatchObject({ name: "ForbiddenError", message: "Usuário não pertence ao projeto" });

    repository.memberships = [{ userId: 1, projectId: 7 }];
    repository.projects = [{ id: 7, leaderId: 99 }];
    await expect(
      useCase().execute({ userId: 1, hours: 1, reason: "r", projectId: 7, deductedBy: 3, deductedByRoles: ["GERENTE_PROJETO"] }),
    ).rejects.toMatchObject({ name: "ForbiddenError", message: "Acesso negado" });

    repository.memberships.push({ userId: 3, projectId: 7 });
    const result = (await useCase().execute({ userId: 1, hours: 4, reason: "r", projectId: 7, deductedBy: 3, deductedByRoles: ["GERENTE_PROJETO"] })) as { message: string };
    expect(result.message).toBe("4 horas retiradas com sucesso");
  });

  it("frozen check order + clamp", async () => {
    // currentWeekHours 8 < 20 -> insufficient first (even though hours is positive)
    await expect(
      useCase().execute({ userId: 1, hours: 20, reason: "r", deductedBy: 2, deductedByRoles: ["COORDENADOR"] }),
    ).rejects.toThrow("Usuário não possui horas suficientes");

    // negative hours pass the currentWeekHours check -> negative rule
    await expect(
      useCase().execute({ userId: 1, hours: -5, reason: "r", deductedBy: 2, deductedByRoles: ["COORDENADOR"] }),
    ).rejects.toMatchObject({ name: "ValidationError", message: "Horas não podem ser negativas" });

    // happy path: weekHours 10-5=5, currentWeekHours clamped 8->5
    const result = (await useCase().execute({ userId: 1, hours: 5, reason: "r", deductedBy: 2, deductedByRoles: ["COORDENADOR"] })) as { user: { weekHours: number; currentWeekHours: number } };
    expect(result.user.weekHours).toBe(5);
    expect(result.user.currentWeekHours).toBe(5);
  });
});

describe("RegisterUserUseCase (OND2-B3)", () => {
  const useCase = () => new RegisterUserUseCase(repository, fakeHasher);

  it("frozen register messages: missing fields (single message) and short password -> ValidationError", async () => {
    await expect(useCase().execute({ name: "N", email: "", password: "" })).rejects.toMatchObject({
      name: "ValidationError",
      status: 400,
      message: "Nome, email e senha são obrigatórios",
    });
    await expect(useCase().execute({ name: "N", email: "n@x.com", password: "123" })).rejects.toMatchObject({
      name: "ValidationError",
      message: "A senha deve ter pelo menos 6 caracteres",
    });
  });

  it("duplicate email -> ConflictError with the frozen message", async () => {
    await expect(useCase().execute({ name: "Dup", email: "ANA@x.com", password: "secret123" })).rejects.toMatchObject({
      name: "ConflictError",
      status: 409,
      message: "Este email já está em uso",
    });
  });

  it("happy path: status pending, roles [], weekHours 0, hash cost 12, public shape", async () => {
    const created = (await useCase().execute({
      name: "  Novo  ",
      email: " NOVO@X.com ",
      password: "secret123",
    })) as unknown as Record<string, unknown>;

    expect(created).not.toHaveProperty("password");
    expect(created.status).toBe("pending");
    expect(created.email).toBe("novo@x.com");
    expect(created.name).toBe("Novo");

    const stored = repository.store.find((u) => u.email === "novo@x.com")!;
    expect(stored.roles).toEqual([]);
    expect(stored.weekHours).toBe(0);
    expect(stored.password).toBe("bcrypt:secret123");
    expect(hasherCalls).toEqual([{ plain: "secret123", rounds: 12 }]);
  });
});

describe("Moderate / Roles / Status / reads", () => {
  it("moderatePendingUser: approve activates, reject deletes, missing -> NotFoundError", async () => {
    const deleteUser = new DeleteUserUseCase(repository);
    const useCase = () => new ModeratePendingUserUseCase(repository, deleteUser);

    const approved = (await useCase().execute(4, "approve")) as { status: string };
    expect(approved.status).toBe("active");

    await useCase().execute(4, "reject");
    expect(repository.store.find((u) => u.id === 4)).toBeUndefined();

    await expect(useCase().execute(99, "approve")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("roles add/remove/set and status mapping", async () => {
    const roles = new UpdateUserRolesUseCase(repository);
    expect(((await roles.execute({ userId: 1, action: "add", role: "PESQUISADOR" })) as { roles: string[] }).roles).toEqual(["VOLUNTARIO", "PESQUISADOR"]);
    expect(((await roles.execute({ userId: 1, action: "remove", role: "VOLUNTARIO" })) as { roles: string[] }).roles).toEqual(["PESQUISADOR"]);
    expect(((await roles.execute({ userId: 1, action: "set", roles: ["GERENTE", "GERENTE"] })) as { roles: string[] }).roles).toEqual(["GERENTE"]);

    const status = new UpdateUserStatusUseCase(repository);
    expect(((await status.execute({ userId: 1, action: "suspend" })) as { status: string }).status).toBe("suspended");
    expect(((await status.execute({ userId: 1, action: "estranho" as never })) as { status: string }).status).toBe("active");
  });

  it("statistics dispatch, leaderboard default limit, profiles quirk (both call 'public')", async () => {
    expect(await new ListUserStatisticsUseCase(repository).execute("roles")).toEqual({ VOLUNTARIO: 1, COORDENADOR: 1, GERENTE_PROJETO: 1 });

    const leaderboard = (await new ListLeaderboardUseCase(repository).execute({ type: "points" })) as unknown[];
    expect(leaderboard).toHaveLength(3); // active only, limit 10

    await new ListProfilesUseCase(repository).execute({ type: "public" });
    await new ListProfilesUseCase(repository).execute({ type: "members" });
    expect(repository.visibilityCalls).toEqual(["public", "public"]);
  });
});
