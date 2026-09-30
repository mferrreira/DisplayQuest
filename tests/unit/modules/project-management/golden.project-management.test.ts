// @vitest-environment node
/**
 * OND5-B1 (R0) — golden/characterization matrix of `ProjectServiceGateway` (288 lines)
 * BEFORE the Onda 5 refactor touches it. Frozen behaviors (incl. quirks):
 *
 *   - canActorAccessProject: MANAGE_USERS/MANAGE_PROJECTS bypass; else membership OR
 *     leaderId OR createdBy.
 *   - canActorManageProject QUIRK: when a membership EXISTS, only its roles count
 *     (COORDENADOR/GERENTE/GERENTE_PROJETO) — a global MANAGE_USERS user who is a plain
 *     VOLUNTARIO member CANNOT manage. Only membership-less actors fall back to the user's
 *     global MANAGE_USERS.
 *   - createProject: Project.create stamps createdAt (server clock) + createdBy = actor;
 *     creator gets a GERENTE_PROJETO membership; leaderId !== actor gets one too; volunteerIds
 *     are filtered (number > 0) + deduped + skip actor/leader, and per-volunteer failures are
 *     SWALLOWED with console.error (the project is still returned).
 *   - updateProject: name String()-coerced; falsy description -> null; the gateway assigns
 *     status/links as-is but ProjectRepository.update validates the status enum (invalid
 *     status surfaces as "Dados inválidos: Status do projeto inválido"); leaderId conflict
 *     checked against OTHER projects only; leaderId null clears without checks.
 *   - deleteProject: only active/archived/on_hold can be deleted (completed cannot).
 *   - getProjectVolunteersStats: VOLUNTARIO/COLABORADOR members only; hours rounded to 2
 *     decimals; role = roles[0] || VOLUNTARIO; name fallback "Usuário"; lastActivity is the
 *     UTC date of the server clock; stats totals sum the ALREADY-rounded per-volunteer hours.
 *   - listProjectsForActor (module): MANAGE_TASKS sees ALL projects ("laboratório aberto");
 *     others get member UNION created UNION led, deduped by id.
 *
 * Seams: fake repositories injected via the gateway constructor + fake `@/lib/database/prisma`
 * (the two prisma-direct methods canActorAccessProject/getProjectVolunteersStats are frozen
 * as-is). Clock frozen with vi fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type ProjectRow = {
    id: number;
    name: string;
    description: string | null;
    createdAt: string;
    createdBy: number;
    leaderId: number | null;
    status: string;
    links: unknown;
  };
  type MemberRow = { id: number; projectId: number; userId: number; roles: string[]; joinedAt: Date };
  type UserRow = { id: number; name?: string; email?: string; avatar?: string | null; roles: string[]; points: number; completedTasks: number };
  type SessionRow = { id: number; userId: number; projectId: number | null; status: string; duration: number | null; startTime: Date };

  const state = {
    projects: [] as ProjectRow[],
    members: [] as MemberRow[],
    users: [] as UserRow[],
    sessions: [] as SessionRow[],
    nextProjectId: 900,
    nextMemberId: 500,
    prismaAccessReads: [] as string[],
    membershipFailFor: [] as number[],
  };

  const prisma = {
    project_members: {
      findFirst: async (args: { where: { projectId: number; userId: number } }) => {
        state.prismaAccessReads.push(`members:${args.where.projectId}:${args.where.userId}`);
        const found = state.members.find((m) => m.projectId === args.where.projectId && m.userId === args.where.userId);
        return found ? { id: found.id } : null;
      },
    },
    projects: {
      findUnique: async (args: { where: { id: number } }) => {
        state.prismaAccessReads.push(`projects:${args.where.id}`);
        const found = state.projects.find((p) => p.id === args.where.id);
        return found ? { leaderId: found.leaderId, createdBy: found.createdBy } : null;
      },
    },
    work_sessions: {
      findMany: async (args: { where: { userId: number; projectId: number; status: string; startTime?: { gte: Date; lte: Date } } }) => {
        return state.sessions
          .filter((s) => {
            if (s.userId !== args.where.userId || s.projectId !== args.where.projectId || s.status !== args.where.status) return false;
            if (args.where.startTime && (s.startTime < args.where.startTime.gte || s.startTime > args.where.startTime.lte)) return false;
            return true;
          })
          .map((s) => ({ duration: s.duration }));
      },
    },
  };

  function reset() {
    state.projects = [
      { id: 5, name: "Proj A", description: "desc", createdAt: "2026-06-01T12:00:00.000Z", createdBy: 9, leaderId: null, status: "active", links: null },
      { id: 6, name: "Proj B", description: null, createdAt: "2026-06-02T12:00:00.000Z", createdBy: 7, leaderId: 8, status: "completed", links: null },
    ];
    state.members = [];
    state.users = [
      { id: 7, name: "Ana", email: "ana@test.local", avatar: "/uploads/avatars/ana.png", roles: ["VOLUNTARIO"], points: 10, completedTasks: 3 },
      { id: 8, name: "Beto", email: "beto@test.local", roles: ["COLABORADOR"], points: 0, completedTasks: 0 },
      { id: 9, name: "Coord", email: "coord@test.local", roles: ["COORDENADOR"], points: 0, completedTasks: 0 },
    ];
    state.sessions = [];
    state.nextProjectId = 900;
    state.nextMemberId = 500;
    state.prismaAccessReads = [];
    state.membershipFailFor = [];
  }

  return { state, prisma, reset };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: harness.prisma }));

import { Project } from "@/backend/models/Project";
import { ProjectMembership } from "@/backend/models/ProjectMembership";
import { ProjectServiceGateway } from "@/backend/modules/project-management/infrastructure/project-management.gateway";
import { createProjectManagementModule } from "@/backend/modules/project-management";
import { hasPermission } from "@/backend/domain";
import type { IdentityAccessModule } from "@/backend/modules/identity-access";
import type { ProjectRepository } from "@/backend/repositories/ProjectRepository";
import type { ProjectMembershipRepository } from "@/backend/repositories/ProjectMembershipRepository";
import type { UserRepository } from "@/backend/repositories/UserRepository";

/** Mirrors backend/repositories/ProjectRepository (validation messages + createdAt desc). */
class FakeProjectRepository {
  async findAll() {
    return [...harness.state.projects]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => Project.fromPrisma(row));
  }
  async findById(id: number) {
    const row = harness.state.projects.find((p) => p.id === id);
    return row ? Project.fromPrisma(row) : null;
  }
  async findByUserId(userId: number) {
    const projectIds = new Set(harness.state.members.filter((m) => m.userId === userId).map((m) => m.projectId));
    return harness.state.projects
      .filter((p) => projectIds.has(p.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => Project.fromPrisma(row));
  }
  async findByCreatorId(creatorId: number) {
    return harness.state.projects
      .filter((p) => p.createdBy === creatorId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => Project.fromPrisma(row));
  }
  async findByLeaderId(leaderId: number) {
    return harness.state.projects
      .filter((p) => p.leaderId === leaderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => Project.fromPrisma(row));
  }
  async create(project: Project) {
    const errors = this.validate(project);
    if (errors.length > 0) throw new Error(`Dados inválidos: ${errors.join(", ")}`);
    const row = {
      id: harness.state.nextProjectId++,
      name: project.name,
      description: project.description ?? null,
      createdAt: project.createdAt,
      createdBy: project.createdBy,
      leaderId: project.leaderId ?? null,
      status: project.status,
      links: project.links ?? null,
    };
    harness.state.projects.push(row);
    return Project.fromPrisma(row);
  }
  async update(project: Project) {
    if (!project.id) throw new Error("ID do projeto é obrigatório para atualização");
    const errors = this.validate(project);
    if (errors.length > 0) throw new Error(`Dados inválidos: ${errors.join(", ")}`);
    const row = harness.state.projects.find((p) => p.id === project.id)!;
    row.name = project.name;
    row.description = project.description ?? null;
    row.leaderId = project.leaderId ?? null;
    row.status = project.status;
    row.links = project.links ?? null;
    return Project.fromPrisma(row);
  }
  async delete(id: number) {
    const idx = harness.state.projects.findIndex((p) => p.id === id);
    if (idx >= 0) harness.state.projects.splice(idx, 1);
  }
  private validate(project: Project): string[] {
    const errors: string[] = [];
    if (!project.name || project.name.trim().length === 0) errors.push("Nome do projeto é obrigatório");
    else if (project.name.length > 100) errors.push("Nome do projeto não pode ter mais de 100 caracteres");
    if (project.description && project.description.length > 500) errors.push("Descrição do projeto não pode ter mais de 500 caracteres");
    if (!project.createdBy || project.createdBy <= 0) errors.push("ID do criador do projeto é obrigatório");
    if (!["active", "completed", "archived", "on_hold"].includes(project.status)) errors.push("Status do projeto inválido");
    return errors;
  }
}

/** Mirrors backend/repositories/ProjectMembershipRepository (validation + joinedAt asc). */
class FakeProjectMembershipRepository {
  async findByProjectAndUser(projectId: number, userId: number) {
    const row = harness.state.members.find((m) => m.projectId === projectId && m.userId === userId);
    return row ? ProjectMembership.fromPrisma(row) : null;
  }
  async create(membership: ProjectMembership) {
    if (membership.userId && harness.state.membershipFailFor.includes(membership.userId)) {
      throw new Error(`fake membership failure for ${membership.userId}`);
    }
    const errors: string[] = [];
    if (!membership.projectId || membership.projectId <= 0) errors.push("ID do projeto é obrigatório");
    if (!membership.userId || membership.userId <= 0) errors.push("ID do usuário é obrigatório");
    if (!membership.roles || membership.roles.length === 0) errors.push("Pelo menos um papel deve ser atribuído");
    if (errors.length > 0) throw new Error(`Dados inválidos: ${errors.join(", ")}`);
    const row = {
      id: harness.state.nextMemberId++,
      projectId: membership.projectId,
      userId: membership.userId,
      roles: membership.roles,
      joinedAt: membership.joinedAt,
    };
    harness.state.members.push(row);
    return ProjectMembership.fromPrisma(row);
  }
  async update(membership: ProjectMembership) {
    if (!membership.id) throw new Error("ID da participação é obrigatório para atualização");
    const row = harness.state.members.find((m) => m.id === membership.id)!;
    row.roles = membership.roles;
    return ProjectMembership.fromPrisma(row);
  }
  async getProjectMembersWithDetails(projectId: number) {
    return harness.state.members
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
      .map((m) => {
        const user = harness.state.users.find((u) => u.id === m.userId);
        return ProjectMembership.fromPrisma({
          ...m,
          user: user
            ? { id: user.id, name: user.name, email: user.email, roles: user.roles, status: "active", points: user.points, completedTasks: user.completedTasks, avatar: user.avatar }
            : null,
        });
      });
  }
}

class FakeUserRepository {
  async findById(id: number) {
    const user = harness.state.users.find((u) => u.id === id);
    return user ? { id: user.id, roles: user.roles } : null;
  }
}

const fakeIdentityAccess = {
  hasPermission: (roles: unknown, permission: never) => hasPermission(roles, permission),
} as unknown as IdentityAccessModule;

function makeGateway() {
  return new ProjectServiceGateway(
    new FakeProjectRepository() as unknown as ProjectRepository,
    new FakeProjectMembershipRepository() as unknown as ProjectMembershipRepository,
    new FakeUserRepository() as unknown as UserRepository,
    fakeIdentityAccess,
  );
}

const T_13Z = "2026-06-15T13:00:00.000Z";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

let gateway: ProjectServiceGateway;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T_13Z));
  harness.reset();
  gateway = makeGateway();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("golden — list passthroughs", () => {
  it("listAllProjects / listProjectsByCreator / listProjectsByLeaderId delegate to the repository", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });

    const all = await gateway.listAllProjects();
    expect(all.map((p) => p.id)).toEqual([6, 5]); // createdAt desc

    expect((await gateway.listProjectsByUser(7)).map((p) => p.id)).toEqual([5]);
    expect((await gateway.listProjectsByCreator(9)).map((p) => p.id)).toEqual([5]);
    expect((await gateway.listProjectsByLeaderId(8)).map((p) => p.id)).toEqual([6]);
    expect((await gateway.getProjectById(5))?.id).toBe(5);
    expect(await gateway.getProjectById(99)).toBeNull();
  });
});

describe("golden — canActorAccessProject", () => {
  it("MANAGE_USERS (COORDENADOR) bypasses without any DB read", async () => {
    expect(await gateway.canActorAccessProject(5, 7, ["COORDENADOR"])).toBe(true);
    expect(harness.state.prismaAccessReads).toEqual([]);
  });

  it("MANAGE_PROJECTS (GERENTE_PROJETO) bypasses", async () => {
    expect(await gateway.canActorAccessProject(5, 7, ["GERENTE_PROJETO"])).toBe(true);
    expect(harness.state.prismaAccessReads).toEqual([]);
  });

  it("membership grants access", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
    expect(await gateway.canActorAccessProject(5, 7, ["VOLUNTARIO"])).toBe(true);
  });

  it("leaderId or createdBy grant access", async () => {
    expect(await gateway.canActorAccessProject(6, 8, ["VOLUNTARIO"])).toBe(true); // leader of 6
    expect(await gateway.canActorAccessProject(6, 7, ["VOLUNTARIO"])).toBe(true); // creator of 6
  });

  it("no relation -> false", async () => {
    expect(await gateway.canActorAccessProject(5, 8, ["VOLUNTARIO"])).toBe(false);
  });
});

describe("golden — createProject", () => {
  it("stamps createdAt/createdBy + creator GERENTE_PROJETO membership", async () => {
    const created = await gateway.createProject({
      actorId: 9,
      data: { name: "Proj Novo", description: "d", status: "active" as never, links: null },
    });

    expect(created.id).toBe(900);
    const row = harness.state.projects.find((p) => p.id === 900)!;
    expect(row.createdBy).toBe(9);
    expect(row.createdAt).toBe(T_13Z); // Project.create server clock
    expect(harness.state.members).toHaveLength(1);
    expect(harness.state.members[0]).toMatchObject({ projectId: 900, userId: 9, roles: ["GERENTE_PROJETO"] });
  });

  it("leaderId !== actor gets a GERENTE_PROJETO membership; leaderId === actor does not duplicate", async () => {
    await gateway.createProject({ actorId: 9, data: { name: "P", status: "active" as never, leaderId: 7 } });
    expect(harness.state.members.map((m) => [m.userId, m.roles])).toEqual([
      [9, ["GERENTE_PROJETO"]],
      [7, ["GERENTE_PROJETO"]],
    ]);

    harness.reset();
    await gateway.createProject({ actorId: 9, data: { name: "P", status: "active" as never, leaderId: 9 } });
    expect(harness.state.members).toHaveLength(1); // creator only
  });

  it("volunteerIds: filtered (number > 0), deduped, actor/leader skipped, VOLUNTARIO role", async () => {
    const created = await gateway.createProject({
      actorId: 9,
      data: { name: "P", status: "active" as never, leaderId: 8 },
      volunteerIds: [7, 7, 0, -1, 8, 9, 11],
    });

    const volunteerMemberships = harness.state.members.filter((m) => m.roles.includes("VOLUNTARIO"));
    expect(volunteerMemberships.map((m) => m.userId)).toEqual([7, 11]); // dedup + skip leader 8 / actor 9
    expect(created.id).toBe(900);
  });

  it("QUIRK: a failing volunteer is swallowed with console.error; the rest still land", async () => {
    harness.state.membershipFailFor = [7];
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const created = await gateway.createProject({ actorId: 9, data: { name: "P", status: "active" as never }, volunteerIds: [7, 11] });

    expect(created.id).toBe(900);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("Erro ao adicionar voluntário 7"), expect.any(Error));
    expect(harness.state.members.filter((m) => m.roles.includes("VOLUNTARIO")).map((m) => m.userId)).toEqual([11]);
    spy.mockRestore();
  });

  it("repository validation propagates verbatim", async () => {
    await expect(
      gateway.createProject({ actorId: 9, data: { name: "   ", status: "active" as never } }),
    ).rejects.toThrow("Dados inválidos: Nome do projeto é obrigatório");
  });
});

describe("golden — updateProject", () => {
  it("unknown project -> 'Projeto não encontrado'", async () => {
    await expect(gateway.updateProject({ projectId: 99, actorId: 9, data: { name: "x" } })).rejects.toThrow("Projeto não encontrado");
  });

  it("no manage permission -> frozen message", async () => {
    await expect(gateway.updateProject({ projectId: 5, actorId: 7, data: { name: "x" } })).rejects.toThrow(
      "Usuário não tem permissão para gerenciar este projeto",
    );
  });

  it("field quirks: name String()-coerced, falsy description -> null, undefined untouched; invalid status rejected by the REPOSITORY (gateway does not validate)", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 9, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });

    const updated = await gateway.updateProject({
      projectId: 5,
      actorId: 9,
      data: { name: 42 as never, description: "", status: "archived" as never },
    });

    expect(updated.name).toBe("42");
    expect(updated.description).toBeNull();
    expect(updated.status).toBe("archived");
    const row = harness.state.projects.find((p) => p.id === 5)!;
    expect(row.links).toBeNull(); // untouched
    expect(row.leaderId).toBeNull(); // untouched

    // The gateway assigns `status as any` blindly, but ProjectRepository.update validates
    // against the enum -> invalid status surfaces as the repository's validation error.
    await expect(gateway.updateProject({ projectId: 5, actorId: 9, data: { status: "weird-status" as never } })).rejects.toThrow(
      "Dados inválidos: Status do projeto inválido",
    );
  });

  it("leaderId conflict checked against OTHER projects only (same project allowed)", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 9, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });

    // 8 already leads 6 -> cannot lead 5 too
    await expect(gateway.updateProject({ projectId: 5, actorId: 9, data: { leaderId: 8 } })).rejects.toThrow(
      "Este usuário já é líder de outro projeto. Um usuário só pode ser líder de um projeto por vez.",
    );

    // 8 already leads 5? no — but re-setting the CURRENT leader of 6 to 6's own leader is fine
    const updated = await gateway.updateProject({ projectId: 6, actorId: 9, data: { leaderId: 8 } });
    expect(updated.leaderId).toBe(8);
  });

  it("leaderId null clears without checks", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 9, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
    const updated = await gateway.updateProject({ projectId: 6, actorId: 9, data: { leaderId: null } });
    expect(updated.leaderId).toBeNull();
    expect(harness.state.projects.find((p) => p.id === 6)!.leaderId).toBeNull();
  });
});

describe("golden — deleteProject", () => {
  it("unknown -> 'Projeto não encontrado'; no permission -> frozen message", async () => {
    await expect(gateway.deleteProject({ projectId: 99, actorId: 9 })).rejects.toThrow("Projeto não encontrado");
    await expect(gateway.deleteProject({ projectId: 5, actorId: 7 })).rejects.toThrow("Usuário não tem permissão para excluir este projeto");
  });

  it("status gate: completed CANNOT be deleted; active/archived/on_hold can", async () => {
    await expect(gateway.deleteProject({ projectId: 6, actorId: 9 })).rejects.toThrow("Projeto não pode ser excluído no status atual");

    await gateway.deleteProject({ projectId: 5, actorId: 9 });
    expect(harness.state.projects.find((p) => p.id === 5)).toBeUndefined();
  });
});

describe("golden — canActorManageProject", () => {
  it("membership roles decide: GERENTE_PROJETO true, plain VOLUNTARIO membership false", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
    expect(await gateway.canActorManageProject(5, 7)).toBe(false);

    harness.state.members[0].roles = ["GERENTE_PROJETO"];
    expect(await gateway.canActorManageProject(5, 7)).toBe(true);
  });

  it("QUIRK: global COORDENADOR who IS a plain member cannot manage (membership branch wins)", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 9, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
    expect(await gateway.canActorManageProject(5, 9)).toBe(false);
  });

  it("no membership: falls back to the user's global MANAGE_USERS; unknown user false", async () => {
    expect(await gateway.canActorManageProject(5, 9)).toBe(true); // COORDENADOR, no membership
    expect(await gateway.canActorManageProject(5, 7)).toBe(false); // VOLUNTARIO, no membership
    expect(await gateway.canActorManageProject(5, 999)).toBe(false); // unknown user
  });
});

describe("golden — getProjectVolunteersStats", () => {
  it("VOLUNTARIO/COLABORADOR only, rounded hours, fallbacks, UTC lastActivity, stats totals", async () => {
    harness.state.members.push(
      { id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") },
      { id: 2, projectId: 5, userId: 8, roles: ["COLABORADOR"], joinedAt: new Date("2026-06-02T12:00:00.000Z") },
      { id: 3, projectId: 5, userId: 9, roles: ["COORDENADOR"], joinedAt: new Date("2026-06-03T12:00:00.000Z") }, // filtered out
      { id: 4, projectId: 5, userId: 999, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-04T12:00:00.000Z") }, // no user row
    );
    harness.state.sessions.push(
      { id: 1, userId: 7, projectId: 5, status: "completed", duration: 5400, startTime: new Date("2026-06-15T12:00:00.000Z") },
      { id: 2, userId: 7, projectId: 5, status: "completed", duration: 100, startTime: new Date("2026-06-15T11:00:00.000Z") },
      { id: 3, userId: 7, projectId: 5, status: "active", duration: null, startTime: new Date("2026-06-15T12:30:00.000Z") },
      { id: 4, userId: 7, projectId: 5, status: "completed", duration: 3600, startTime: new Date("2026-05-01T12:00:00.000Z") }, // outside any week
    );

    const stats = (await gateway.getProjectVolunteersStats(5)) as {
      volunteers: Array<Record<string, unknown>>;
      stats: Record<string, unknown>;
    };

    expect(stats.volunteers.map((v) => v.id)).toEqual([7, 8, 999]);
    const ana = stats.volunteers[0];
    expect(ana).toMatchObject({ name: "Ana", email: "ana@test.local", role: "VOLUNTARIO", hoursWorked: 2.53, currentWeekHours: 1.53, tasksCompleted: 3, pointsEarned: 10, status: "active", avatar: "/uploads/avatars/ana.png" });
    expect(ana.lastActivity).toBe("2026-06-15"); // UTC date of the frozen clock

    const ghost = stats.volunteers[2];
    expect(ghost).toMatchObject({ name: "Usuário", email: "", role: "VOLUNTARIO", hoursWorked: 0, currentWeekHours: 0, tasksCompleted: 0, pointsEarned: 0 });

    expect(stats.stats).toEqual({ totalVolunteers: 3, totalHours: 2.53, completedTasks: 3, totalPoints: 10 });
  });
});

describe("golden — module surface (use cases)", () => {
  // OND5-B2: the factory now wires use cases over ports (the legacy gateway is indexed by
  // the gateway-level goldens above + the contract suite). These module goldens keep the
  // SAME frozen assertions over a fake-ports bundle built from the same harness state.
  function makePorts() {
    const toRecord = (row: (typeof harness.state.projects)[number]) => ({ ...row })

    const projects = {
      findAll: async () => [...harness.state.projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toRecord),
      findByUserId: async (userId: number) => {
        const projectIds = new Set(harness.state.members.filter((m) => m.userId === userId).map((m) => m.projectId))
        return harness.state.projects.filter((p) => projectIds.has(p.id)).map(toRecord)
      },
      findByCreatorId: async (creatorId: number) => harness.state.projects.filter((p) => p.createdBy === creatorId).map(toRecord),
      findByLeaderId: async (leaderId: number) => harness.state.projects.filter((p) => p.leaderId === leaderId).map(toRecord),
      findById: async (id: number) => {
        const row = harness.state.projects.find((p) => p.id === id)
        return row ? toRecord(row) : null
      },
      create: async (input: Record<string, unknown>) => {
        const row = { ...(input as object), id: harness.state.nextProjectId++ } as (typeof harness.state.projects)[number]
        harness.state.projects.push(row)
        return toRecord(row)
      },
      update: async (record: (typeof harness.state.projects)[number]) => {
        const row = harness.state.projects.find((p) => p.id === record.id)!
        Object.assign(row, record)
        return toRecord(row)
      },
      delete: async (id: number) => {
        const idx = harness.state.projects.findIndex((p) => p.id === id)
        if (idx >= 0) harness.state.projects.splice(idx, 1)
      },
    }

    const memberships = {
      findMembership: async (projectId: number, userId: number) => {
        const row = harness.state.members.find((m) => m.projectId === projectId && m.userId === userId)
        return row ? { id: row.id, roles: row.roles } : null
      },
      createMembership: async (input: { projectId: number; userId: number; roles: string[] }) => {
        if (harness.state.membershipFailFor.includes(input.userId)) throw new Error(`fake membership failure for ${input.userId}`)
        harness.state.members.push({ id: harness.state.nextMemberId++, projectId: input.projectId, userId: input.userId, roles: input.roles, joinedAt: new Date() })
      },
      updateMembershipRoles: async (membershipId: number, roles: string[]) => {
        const row = harness.state.members.find((m) => m.id === membershipId)
        if (row) row.roles = roles
      },
      listMembersWithUser: async (projectId: number) =>
        harness.state.members
          .filter((m) => m.projectId === projectId)
          .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
          .map((m) => {
            const user = harness.state.users.find((u) => u.id === m.userId)
            return {
              id: m.id,
              projectId: m.projectId,
              userId: m.userId,
              roles: m.roles,
              joinedAt: m.joinedAt,
              user: user
                ? { id: user.id, name: user.name ?? null, email: user.email ?? null, avatar: user.avatar ?? null, points: user.points, completedTasks: user.completedTasks }
                : null,
            }
          }),
    }

    const actors = {
      findActor: async (userId: number) => {
        const user = harness.state.users.find((u) => u.id === userId)
        return user ? { id: user.id, roles: user.roles } : null
      },
      membershipExists: async (projectId: number, userId: number) =>
        harness.state.members.some((m) => m.projectId === projectId && m.userId === userId),
      findProjectRelation: async (projectId: number) => {
        const project = harness.state.projects.find((p) => p.id === projectId)
        return project ? { leaderId: project.leaderId, createdBy: project.createdBy } : null
      },
    }

    const hours = {
      sumCompletedSeconds: async (userId: number, projectId: number, window?: { start: Date; end: Date }) =>
        harness.state.sessions
          .filter((s) => {
            if (s.userId !== userId || s.projectId !== projectId || s.status !== "completed") return false
            if (window && (s.startTime < window.start || s.startTime > window.end)) return false
            return true
          })
          .reduce((sum, s) => sum + (s.duration ?? 0), 0),
    }

    return { projects, memberships, actors, hours }
  }
  it("listProjectsForActor: MANAGE_TASKS sees ALL; VOLUNTARIO gets member UNION created UNION led deduped", async () => {
    const projectModule = createProjectManagementModule({ ports: makePorts() as never });

    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });

    const all = await projectModule.listProjectsForActor({ actorId: 8, actorRoles: ["COLABORADOR"] }); // MANAGE_TASKS
    expect(all.map((p) => p.id)).toEqual([6, 5]);

    const ana = await projectModule.listProjectsForActor({ actorId: 7, actorRoles: ["VOLUNTARIO"] });
    expect(ana.map((p) => p.id)).toEqual([5, 6]); // member 5 + creator 6, deduped
  });

  it("getProjectForActor: not found / MANAGE_PROJECTS bypass / 'Acesso negado ao projeto'", async () => {
    const projectModule = createProjectManagementModule({ ports: makePorts() as never });

    await expect(projectModule.getProjectForActor({ projectId: 99, actorId: 9, actorRoles: ["COORDENADOR"] })).rejects.toThrow("Projeto não encontrado");
    expect((await projectModule.getProjectForActor({ projectId: 5, actorId: 9, actorRoles: ["COORDENADOR"] })).id).toBe(5);
    await expect(projectModule.getProjectForActor({ projectId: 5, actorId: 8, actorRoles: ["VOLUNTARIO"] })).rejects.toThrow("Acesso negado ao projeto");
  });

  it("getProjectVolunteers: MANAGE_PROJECTS role OR canActorManageProject; else 'Acesso negado ao projeto'", async () => {
    const projectModule = createProjectManagementModule({ ports: makePorts() as never });

    const stats = await projectModule.getProjectVolunteers({ projectId: 5, actorId: 9, actorRoles: ["COORDENADOR"] });
    expect(stats).toBeDefined();

    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
    expect(await projectModule.getProjectVolunteers({ projectId: 5, actorId: 7, actorRoles: ["VOLUNTARIO"] })).toBeDefined();

    await expect(projectModule.getProjectVolunteers({ projectId: 5, actorId: 8, actorRoles: ["VOLUNTARIO"] })).rejects.toThrow("Acesso negado ao projeto");
  });
});
