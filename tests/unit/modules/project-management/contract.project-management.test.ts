// @vitest-environment node
/**
 * OND5-B3 (R3) — contract parity of the project-management module: the LEGACY
 * `ProjectServiceGateway` (kept alive at the seam, DEC-15) vs the NEW wiring
 * (`createProjectManagementModule` over the thin ports), both running over the SAME fake
 * world rebuilt from a pristine seed on every call (DEC-18).
 *
 * Parity at the JSON-observable boundary (the Project view the routes serialize), the FULL
 * store state after the call and errors compared BY MESSAGE (typed DomainErrors must carry
 * the legacy messages verbatim, including the repository's "Dados inválidos: ..." wrap).
 *
 * For the three module-level use cases whose old wiring was use-case-over-gateway, the old
 * side composes the SAME frozen use-case flow over the legacy gateway (the use-case code
 * itself is pinned by the golden matrix OND5-B1/5-B2).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/backend/domain";

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
type MemberRow = { id: number; projectId: number; userId: number; roles: Role[]; joinedAt: Date };
type UserRow = { id: number; name?: string; email?: string; avatar?: string | null; roles: string[]; points: number; completedTasks: number };
type SessionRow = { id: number; userId: number; projectId: number | null; status: string; duration: number | null; startTime: Date };

interface World {
  projects: ProjectRow[];
  members: MemberRow[];
  users: UserRow[];
  sessions: SessionRow[];
  nextProjectId: number;
  nextMemberId: number;
  membershipFailFor: number[];
}

function seedWorld(): World {
  return {
    projects: [
      { id: 5, name: "Proj A", description: "desc", createdAt: "2026-06-01T12:00:00.000Z", createdBy: 9, leaderId: null, status: "active", links: null },
      { id: 6, name: "Proj B", description: null, createdAt: "2026-06-02T12:00:00.000Z", createdBy: 7, leaderId: 8, status: "completed", links: null },
    ],
    members: [],
    users: [
      { id: 7, name: "Ana", email: "ana@test.local", avatar: "/uploads/avatars/ana.png", roles: ["VOLUNTARIO"], points: 10, completedTasks: 3 },
      { id: 8, name: "Beto", email: "beto@test.local", roles: ["COLABORADOR"], points: 0, completedTasks: 0 },
      { id: 9, name: "Coord", email: "coord@test.local", roles: ["COORDENADOR"], points: 0, completedTasks: 0 },
    ],
    sessions: [],
    nextProjectId: 900,
    nextMemberId: 500,
    membershipFailFor: [],
  };
}

let world: World = seedWorld();

// Fake prisma for the legacy gateway's two prisma-direct methods (old side). Lives in
// vi.hoisted because the mocked module is imported before the test body runs.
const harness = vi.hoisted(() => {
  const current = { value: null as unknown as World };

  const prisma = {
    project_members: {
      findFirst: async (args: { where: { projectId: number; userId: number } }) => {
        const found = current.value.members.find((m) => m.projectId === args.where.projectId && m.userId === args.where.userId);
        return found ? { id: found.id } : null;
      },
    },
    projects: {
      findUnique: async (args: { where: { id: number } }) => {
        const found = current.value.projects.find((p) => p.id === args.where.id);
        return found ? { leaderId: found.leaderId, createdBy: found.createdBy } : null;
      },
    },
    work_sessions: {
      findMany: async (args: { where: { userId: number; projectId: number; status: string; startTime?: { gte: Date; lte: Date } } }) =>
        current.value.sessions
          .filter((s) => {
            if (s.userId !== args.where.userId || s.projectId !== args.where.projectId || s.status !== args.where.status) return false;
            if (args.where.startTime && (s.startTime < args.where.startTime.gte || s.startTime > args.where.startTime.lte)) return false;
            return true;
          })
          .map((s) => ({ duration: s.duration })),
    },
  };

  return { current, prisma };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: harness.prisma }));

import { Project } from "@/backend/models/Project";
import { ProjectMembership } from "@/backend/models/ProjectMembership";
import { ProjectServiceGateway } from "@/backend/modules/project-management/infrastructure/project-management.gateway";
import { createProjectManagementModule } from "@/backend/modules/project-management";
import type { NewProjectInput, ProjectRecord } from "@/backend/modules/project-management/application/ports/project.repository";
import { hasPermission } from "@/backend/domain";
import type { IdentityAccessModule } from "@/backend/modules/identity-access";
import type { ProjectRepository } from "@/backend/repositories/ProjectRepository";
import type { ProjectMembershipRepository } from "@/backend/repositories/ProjectMembershipRepository";
import type { UserRepository } from "@/backend/repositories/UserRepository";

// ------------------------------------------------------------------ old side (legacy gateway + fake repos)

function validateProject(project: Project): string[] {
  const errors: string[] = [];
  if (!project.name || project.name.trim().length === 0) errors.push("Nome do projeto é obrigatório");
  else if (project.name.length > 100) errors.push("Nome do projeto não pode ter mais de 100 caracteres");
  if (project.description && project.description.length > 500) errors.push("Descrição do projeto não pode ter mais de 500 caracteres");
  if (!project.createdBy || project.createdBy <= 0) errors.push("ID do criador do projeto é obrigatório");
  if (!["active", "completed", "archived", "on_hold"].includes(project.status)) errors.push("Status do projeto inválido");
  return errors;
}

class FakeProjectRepository {
  async findAll() {
    return [...world.projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((row) => Project.fromPrisma(row));
  }
  async findById(id: number) {
    const row = world.projects.find((p) => p.id === id);
    return row ? Project.fromPrisma(row) : null;
  }
  async findByUserId(userId: number) {
    const projectIds = new Set(world.members.filter((m) => m.userId === userId).map((m) => m.projectId));
    return world.projects.filter((p) => projectIds.has(p.id)).map((row) => Project.fromPrisma(row));
  }
  async findByCreatorId(creatorId: number) {
    return world.projects.filter((p) => p.createdBy === creatorId).map((row) => Project.fromPrisma(row));
  }
  async findByLeaderId(leaderId: number) {
    return world.projects.filter((p) => p.leaderId === leaderId).map((row) => Project.fromPrisma(row));
  }
  async create(project: Project) {
    const errors = validateProject(project);
    if (errors.length > 0) throw new Error(`Dados inválidos: ${errors.join(", ")}`);
    const row = {
      id: world.nextProjectId++,
      name: project.name,
      description: project.description ?? null,
      createdAt: project.createdAt,
      createdBy: project.createdBy,
      leaderId: project.leaderId ?? null,
      status: project.status,
      links: project.links ?? null,
    };
    world.projects.push(row);
    return Project.fromPrisma(row);
  }
  async update(project: Project) {
    const errors = validateProject(project);
    if (errors.length > 0) throw new Error(`Dados inválidos: ${errors.join(", ")}`);
    const row = world.projects.find((p) => p.id === project.id)!;
    row.name = project.name;
    row.description = project.description ?? null;
    row.leaderId = project.leaderId ?? null;
    row.status = project.status;
    row.links = project.links ?? null;
    return Project.fromPrisma(row);
  }
  async delete(id: number) {
    const idx = world.projects.findIndex((p) => p.id === id);
    if (idx >= 0) world.projects.splice(idx, 1);
  }
}

class FakeProjectMembershipRepository {
  async findByProjectAndUser(projectId: number, userId: number) {
    const row = world.members.find((m) => m.projectId === projectId && m.userId === userId);
    return row ? ProjectMembership.fromPrisma(row) : null;
  }
  async create(membership: ProjectMembership) {
    if (membership.userId && world.membershipFailFor.includes(membership.userId)) {
      throw new Error(`fake membership failure for ${membership.userId}`);
    }
    world.members.push({
      id: world.nextMemberId++,
      projectId: membership.projectId,
      userId: membership.userId,
      roles: membership.roles,
      joinedAt: membership.joinedAt,
    });
    return ProjectMembership.fromPrisma(world.members[world.members.length - 1]);
  }
  async update(membership: ProjectMembership) {
    const row = world.members.find((m) => m.id === membership.id)!;
    row.roles = membership.roles;
    return ProjectMembership.fromPrisma(row);
  }
  async getProjectMembersWithDetails(projectId: number) {
    return world.members
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
      .map((m) => {
        const user = world.users.find((u) => u.id === m.userId);
        return ProjectMembership.fromPrisma({
          ...m,
          user: user
            ? { id: user.id, name: user.name, email: user.email, roles: user.roles, status: "active", points: user.points, completedTasks: user.completedTasks, avatar: user.avatar ?? null }
            : null,
        });
      });
  }
}

class FakeUserRepository {
  async findById(id: number) {
    const user = world.users.find((u) => u.id === id);
    return user ? { id: user.id, roles: user.roles } : null;
  }
}

const fakeIdentityAccess = {
  hasPermission: (roles: unknown, permission: never) => hasPermission(roles, permission),
} as unknown as IdentityAccessModule;

const legacyGateway = new ProjectServiceGateway(
  new FakeProjectRepository() as unknown as ProjectRepository,
  new FakeProjectMembershipRepository() as unknown as ProjectMembershipRepository,
  new FakeUserRepository() as unknown as UserRepository,
  fakeIdentityAccess,
);

// ------------------------------------------------------------------ new side (ports over the same world)

function makeNewSide() {
  const toRecord = (row: ProjectRow) => ({ ...row });

  const projects = {
    findAll: async () => [...world.projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toRecord),
    findByUserId: async (userId: number) => {
      const projectIds = new Set(world.members.filter((m) => m.userId === userId).map((m) => m.projectId));
      return world.projects.filter((p) => projectIds.has(p.id)).map(toRecord)
    },
    findByCreatorId: async (creatorId: number) => world.projects.filter((p) => p.createdBy === creatorId).map(toRecord),
    findByLeaderId: async (leaderId: number) => world.projects.filter((p) => p.leaderId === leaderId).map(toRecord),
    findById: async (id: number) => {
      const row = world.projects.find((p) => p.id === id);
      return row ? toRecord(row) : null;
    },
    create: async (input: NewProjectInput) => {
      const row: ProjectRow = {
        id: world.nextProjectId++,
        name: input.name,
        description: input.description,
        createdAt: input.createdAt,
        createdBy: input.createdBy,
        leaderId: input.leaderId,
        status: input.status,
        links: input.links,
      };
      world.projects.push(row);
      return toRecord(row);
    },
    update: async (record: ProjectRecord) => {
      const row = world.projects.find((p) => p.id === record.id)!;
      row.name = record.name;
      row.description = record.description ?? null;
      row.leaderId = record.leaderId ?? null;
      row.status = record.status;
      row.links = record.links ?? null;
      return toRecord(row);
    },
    delete: async (id: number) => {
      const idx = world.projects.findIndex((p) => p.id === id);
      if (idx >= 0) world.projects.splice(idx, 1);
    },
  };

  const memberships = {
    findMembership: async (projectId: number, userId: number) => {
      const row = world.members.find((m) => m.projectId === projectId && m.userId === userId);
      return row ? { id: row.id, roles: row.roles } : null;
    },
    createMembership: async (input: { projectId: number; userId: number; roles: Role[] }) => {
      if (world.membershipFailFor.includes(input.userId)) throw new Error(`fake membership failure for ${input.userId}`);
      world.members.push({ id: world.nextMemberId++, projectId: input.projectId, userId: input.userId, roles: input.roles, joinedAt: new Date() });
    },
    updateMembershipRoles: async (membershipId: number, roles: Role[]) => {
      const row = world.members.find((m) => m.id === membershipId);
      if (row) row.roles = roles;
    },
    listMembersWithUser: async (projectId: number) =>
      world.members
        .filter((m) => m.projectId === projectId)
        .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
        .map((m) => {
          const user = world.users.find((u) => u.id === m.userId);
          return {
            id: m.id,
            projectId: m.projectId,
            userId: m.userId,
            roles: m.roles,
            joinedAt: m.joinedAt,
            user: user
              ? { id: user.id, name: user.name ?? null, email: user.email ?? null, avatar: user.avatar ?? null, points: user.points, completedTasks: user.completedTasks }
              : null,
          };
        }),
  };

  const actors = {
    findActor: async (userId: number) => {
      const user = world.users.find((u) => u.id === userId);
      return user ? { id: user.id, roles: user.roles } : null;
    },
    membershipExists: async (projectId: number, userId: number) =>
      world.members.some((m) => m.projectId === projectId && m.userId === userId),
    findProjectRelation: async (projectId: number) => {
      const project = world.projects.find((p) => p.id === projectId);
      return project ? { leaderId: project.leaderId, createdBy: project.createdBy } : null;
    },
  };

  const hours = {
    sumCompletedSeconds: async (userId: number, projectId: number, window?: { start: Date; end: Date }) =>
      world.sessions
        .filter((s) => {
          if (s.userId !== userId || s.projectId !== projectId || s.status !== "completed") return false;
          if (window && (s.startTime < window.start || s.startTime > window.end)) return false;
          return true;
        })
        .reduce((sum, s) => sum + (s.duration ?? 0), 0),
  };

  const ports = { projects, memberships, actors, hours };

  return { module: createProjectManagementModule({ ports }), ports };
}

const newSide = makeNewSide();

// ------------------------------------------------------------------ parity runner

const T_13Z = "2026-06-15T13:00:00.000Z";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function storeSnapshot(): unknown {
  return json({
    projects: world.projects,
    members: world.members,
    sessions: world.sessions,
  });
}

async function runParity(
  setup: (w: World) => void,
  oldCall: (gateway: ProjectServiceGateway) => Promise<unknown>,
  newCall?: (side: { module: ReturnType<typeof createProjectManagementModule>; ports: ReturnType<typeof makeNewSide>["ports"] }) => Promise<unknown>,
) {
  // old side
  world = seedWorld();
  setup(world);
  harness.current.value = world;
  let oldResult: unknown;
  let oldError: string | null = null;
  try {
    oldResult = await oldCall(legacyGateway);
  } catch (error) {
    oldError = error instanceof Error ? error.message : String(error);
  }
  const oldStore = storeSnapshot();

  // new side (same pristine seed)
  world = seedWorld();
  setup(world);
  harness.current.value = world;
  let newResult: unknown;
  let newError: string | null = null;
  try {
    newResult = newCall
      ? await newCall(newSide)
      : await (oldCall as unknown as (m: typeof newSide.module) => Promise<unknown>)(newSide.module);
  } catch (error) {
    newError = error instanceof Error ? error.message : String(error);
  }

  expect({ error: newError, result: json(newResult) }).toEqual({ error: oldError, result: json(oldResult) });
  expect(storeSnapshot()).toEqual(oldStore);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T_13Z));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("contract parity — reads", () => {
  it("listAllProjects / byUser / byCreator / byLeaderId / getById (new side: the thin ports)", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      async (service) => ({
        all: await service.listAllProjects(),
        byUser: await service.listProjectsByUser(7),
        byCreator: await service.listProjectsByCreator(9),
        byLeader: await service.listProjectsByLeaderId(8),
        byId: await service.getProjectById(5),
        missing: await service.getProjectById(99),
      }),
      async (svc) => ({
        all: await svc.ports.projects.findAll(),
        byUser: await svc.ports.projects.findByUserId(7),
        byCreator: await svc.ports.projects.findByCreatorId(9),
        byLeader: await svc.ports.projects.findByLeaderId(8),
        byId: await svc.ports.projects.findById(5),
        missing: await svc.ports.projects.findById(99),
      }),
    ));

  it("canActorAccessProject: bypass / membership / leader / creator / false", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      async (service) => ({
        coordBypass: await service.canActorAccessProject(5, 9, ["COORDENADOR"]),
        gerenteProjetoBypass: await service.canActorAccessProject(5, 8, ["GERENTE_PROJETO"]),
        member: await service.canActorAccessProject(5, 7, ["VOLUNTARIO"]),
        leader: await service.canActorAccessProject(6, 8, ["VOLUNTARIO"]),
        creator: await service.canActorAccessProject(6, 7, ["VOLUNTARIO"]),
        denied: await service.canActorAccessProject(5, 8, ["VOLUNTARIO"]),
      }),
    ));

  it("canActorManageProject: membership roles win (QUIRK) / fallback / unknown", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
        w.members.push({ id: 2, projectId: 6, userId: 9, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      async (service) => ({
        plainMember: await service.canActorManageProject(5, 7),
        coordAsPlainMember: await service.canActorManageProject(6, 9),
        coordNoMembership: await service.canActorManageProject(5, 9),
        voluntarioNoMembership: await service.canActorManageProject(5, 8),
        unknown: await service.canActorManageProject(5, 999),
      }),
    ));
});

describe("contract parity — createProject", () => {
  it("happy path: record + creator/leader memberships", () =>
    runParity(
      () => undefined,
      (service) => service.createProject({ actorId: 9, data: { name: "Proj Novo", description: "d", status: "active" as never, leaderId: 7 } }),
    ));

  it("leaderId === actor: only the creator membership", () =>
    runParity(
      () => undefined,
      (service) => service.createProject({ actorId: 9, data: { name: "P", status: "active" as never, leaderId: 9 } }),
    ));

  it("volunteerIds: filtered, deduped, actor/leader skipped", () =>
    runParity(
      () => undefined,
      (service) => service.createProject({ actorId: 9, data: { name: "P", status: "active" as never, leaderId: 8 }, volunteerIds: [7, 7, 0, -1, 8, 9, 11] }),
    ));

  it("QUIRK: failing volunteer swallowed, the rest land", () =>
    runParity(
      (w) => {
        w.membershipFailFor = [7];
      },
      async (service) => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const result = await service.createProject({ actorId: 9, data: { name: "P", status: "active" as never }, volunteerIds: [7, 11] });
        spy.mockRestore();
        return result;
      },
    ));

  it("validation error message verbatim", () =>
    runParity(
      () => undefined,
      (service) => service.createProject({ actorId: 9, data: { name: "   ", status: "active" as never } }),
    ));
});

describe("contract parity — updateProject", () => {
  it("unknown project -> 'Projeto não encontrado'", () =>
    runParity(
      () => undefined,
      (service) => service.updateProject({ projectId: 99, actorId: 9, data: { name: "x" } }),
    ));

  it("no permission -> frozen message", () =>
    runParity(
      () => undefined,
      (service) => service.updateProject({ projectId: 5, actorId: 7, data: { name: "x" } }),
    ));

  it("field quirks: name String(), falsy description -> null, valid status, untouched fields", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 9, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) => service.updateProject({ projectId: 5, actorId: 9, data: { name: 42 as never, description: "", status: "archived" as never } }),
    ));

  it("invalid merged status -> repository validation message verbatim", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 9, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) => service.updateProject({ projectId: 5, actorId: 9, data: { status: "weird-status" as never } }),
    ));

  it("leader conflict in ANOTHER project -> frozen message; same-project leader allowed", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 9, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      async (service) => ({
        conflict: await service.updateProject({ projectId: 5, actorId: 9, data: { leaderId: 8 } }).catch((e: Error) => e.message),
        sameProject: await service.updateProject({ projectId: 6, actorId: 9, data: { leaderId: 8 } }),
      }),
    ));

  it("leaderId null clears without checks", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 9, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) => service.updateProject({ projectId: 6, actorId: 9, data: { leaderId: null } }),
    ));
});

describe("contract parity — deleteProject", () => {
  it("unknown -> not found; no permission -> frozen message", () =>
    runParity(
      () => undefined,
      async (service) => ({
        missing: await service.deleteProject({ projectId: 99, actorId: 9 }).catch((e: Error) => e.message),
        denied: await service.deleteProject({ projectId: 5, actorId: 7 }).catch((e: Error) => e.message),
      }),
    ));

  it("status gate: completed cannot be deleted; active can", () =>
    runParity(
      () => undefined,
      async (service) => ({
        completed: await service.deleteProject({ projectId: 6, actorId: 9 }).catch((e: Error) => e.message),
        active: await service.deleteProject({ projectId: 5, actorId: 9 }),
      }),
    ));
});

describe("contract parity — getProjectVolunteersStats", () => {
  it("filter + shape + rounding + totals (old stats vs new use case)", () =>
    runParity(
      (w) => {
        w.members.push(
          { id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") },
          { id: 2, projectId: 5, userId: 8, roles: ["COLABORADOR"], joinedAt: new Date("2026-06-02T12:00:00.000Z") },
          { id: 3, projectId: 5, userId: 9, roles: ["COORDENADOR"], joinedAt: new Date("2026-06-03T12:00:00.000Z") },
          { id: 4, projectId: 5, userId: 999, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-04T12:00:00.000Z") },
        );
        w.sessions.push(
          { id: 1, userId: 7, projectId: 5, status: "completed", duration: 5400, startTime: new Date("2026-06-15T12:00:00.000Z") },
          { id: 2, userId: 7, projectId: 5, status: "completed", duration: 100, startTime: new Date("2026-06-15T11:00:00.000Z") },
          { id: 3, userId: 7, projectId: 5, status: "active", duration: null, startTime: new Date("2026-06-15T12:30:00.000Z") },
          { id: 4, userId: 7, projectId: 5, status: "completed", duration: 3600, startTime: new Date("2026-05-01T12:00:00.000Z") },
        );
      },
      (service) => service.getProjectVolunteersStats(5),
      (svc) => svc.module.getProjectVolunteers({ projectId: 5, actorId: 9, actorRoles: ["COORDENADOR"] }),
    ));

  it("gate: neither MANAGE_PROJECTS nor canManage -> 'Acesso negado ao projeto' (old: frozen use-case gate)", () =>
    runParity(
      () => undefined,
      async (service) => {
        const canViewAll = hasPermission(["VOLUNTARIO"], "MANAGE_PROJECTS")
        const canManageProject = await service.canActorManageProject(5, 8)
        if (!canViewAll && !canManageProject) throw new Error("Acesso negado ao projeto")
        return await service.getProjectVolunteersStats(5)
      },
      (svc) => svc.module.getProjectVolunteers({ projectId: 5, actorId: 8, actorRoles: ["VOLUNTARIO"] }),
    ));
});

describe("contract parity — module use cases (frozen flow over the legacy gateway)", () => {
  it("listProjectsForActor: MANAGE_TASKS sees ALL (old: gateway.listAllProjects)", () =>
    runParity(
      () => undefined,
      (service) => service.listAllProjects(),
      (svc) => svc.module.listProjectsForActor({ actorId: 8, actorRoles: ["COLABORADOR"] }),
    ));

  it("listProjectsForActor: VOLUNTARIO union deduped (old: same frozen flow inline)", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      async (service) => {
        const all = [...(await service.listProjectsByUser(7)), ...(await service.listProjectsByCreator(7)), ...(await service.listProjectsByLeaderId(7))];
        return all.filter((project, index, self) => index === self.findIndex((candidate) => candidate.id === project.id));
      },
      (svc) => svc.module.listProjectsForActor({ actorId: 7, actorRoles: ["VOLUNTARIO"] }),
    ));

  it("getProjectForActor: not found / bypass / denied (old: same frozen flow inline)", () =>
    runParity(
      () => undefined,
      async (service) => ({
        missing: await (async () => {
          const project = await service.getProjectById(99);
          if (!project) throw new Error("Projeto não encontrado");
          return project;
        })().catch((e: Error) => e.message),
        bypass: await service.getProjectById(5),
        denied: await (async () => {
          const canAccess = await service.canActorAccessProject(5, 8, ["VOLUNTARIO"]);
          if (!canAccess) throw new Error("Acesso negado ao projeto");
          return true;
        })().catch((e: Error) => e.message),
      }),
      async (svc) => ({
        missing: await svc.module.getProjectForActor({ projectId: 99, actorId: 9, actorRoles: ["COORDENADOR"] }).catch((e: Error) => e.message),
        bypass: await svc.module.getProjectForActor({ projectId: 5, actorId: 9, actorRoles: ["COORDENADOR"] }),
        denied: await svc.module.getProjectForActor({ projectId: 5, actorId: 8, actorRoles: ["VOLUNTARIO"] }).catch((e: Error) => e.message),
      }),
    ));
});
