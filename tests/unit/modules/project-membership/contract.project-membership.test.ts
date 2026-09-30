// @vitest-environment node
/**
 * OND5-B3 (R3) — contract parity of the project-membership module: the LEGACY
 * `PrismaProjectMembershipGateway` (kept alive at the seam, DEC-15) vs the NEW wiring
 * (`createProjectMembershipModule` over the thin ports), both running over the SAME fake
 * world rebuilt from a pristine seed on every call (DEC-18).
 *
 * Parity is asserted at the JSON-observable boundary (returned view), the FULL store state
 * after the call (members/users/sessions/projects rows) and errors compared BY MESSAGE
 * (the typed DomainError subclasses must carry the legacy messages verbatim).
 *
 * Sequential on purpose: the two sides share the module-level `world`; the old side runs
 * fully before the world is reset for the new side.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/backend/domain";

type MemberRow = { id: number; projectId: number; userId: number; roles: Role[]; joinedAt: Date };
type UserRow = { id: number; name: string; email: string };
type SessionRow = { id: number; userId: number; projectId: number | null; status: string; duration: number | null; startTime: Date };
type ProjectRow = { id: number; leaderId: number | null; createdBy: number };

interface World {
  members: MemberRow[];
  users: UserRow[];
  sessions: SessionRow[];
  projects: ProjectRow[];
  nextMemberId: number;
}

function seedWorld(): World {
  return {
    members: [],
    users: [
      { id: 7, name: "Ana", email: "ana@test.local" },
      { id: 8, name: "Beto", email: "beto@test.local" },
      { id: 9, name: "Coord", email: "coord@test.local" },
    ],
    sessions: [],
    projects: [{ id: 5, leaderId: null, createdBy: 9 }],
    nextMemberId: 500,
  };
}

let world: World = seedWorld();

// The fake prisma (old side) dispatches through harness.current — set by runParity.
// It lives inside vi.hoisted because the mocked module is imported BEFORE the test body runs.
const harness = vi.hoisted(() => {
  const current = { value: null as unknown as World };

  const withUser = (row: { id: number; projectId: number; userId: number; roles: string[]; joinedAt: Date }) => {
    const user = current.value.users.find((u) => u.id === row.userId);
    return { ...row, user: user ? { id: user.id, name: user.name, email: user.email } : null };
  };

  const prisma = {
    project_members: {
      findMany: async (args: { where: { projectId: number } }) =>
        current.value.members
          .filter((m) => m.projectId === args.where.projectId)
          .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime())
          .map((m) => withUser(m)),
      findUnique: async (args: { where: { projectId_userId: { projectId: number; userId: number } } }) =>
        current.value.members.find(
          (m) => m.projectId === args.where.projectId_userId.projectId && m.userId === args.where.projectId_userId.userId,
        ) ?? null,
      create: async (args: { data: { projectId: number; userId: number; roles: string[] } }) => {
        const row = {
          id: current.value.nextMemberId++,
          projectId: args.data.projectId,
          userId: args.data.userId,
          roles: args.data.roles as MemberRow["roles"],
          joinedAt: new Date(),
        };
        current.value.members.push(row);
        return withUser(row);
      },
      update: async (args: { where: { id: number }; data: { roles?: string[] } }) => {
        const row = current.value.members.find((m) => m.id === args.where.id)!;
        if (args.data.roles) row.roles = args.data.roles as MemberRow["roles"];
        return withUser(row);
      },
      count: async (args: { where: { projectId: number; roles?: { has: string } } }) =>
        current.value.members.filter(
          (m) => m.projectId === args.where.projectId && (!args.where.roles || m.roles.includes(args.where.roles.has as MemberRow["roles"][number])),
        ).length,
      findFirst: async (args: { where: { id: number; projectId: number } }) => {
        const found = current.value.members.find((m) => m.id === args.where.id && m.projectId === args.where.projectId);
        return found ? withUser(found) : null;
      },
      delete: async (args: { where: { id: number } }) => {
        const idx = current.value.members.findIndex((m) => m.id === args.where.id);
        if (idx >= 0) current.value.members.splice(idx, 1);
      },
    },
    work_sessions: {
      groupBy: async (args: {
        by: ["userId"];
        where: { projectId: number; status: string; startTime?: { gte: Date; lte: Date } };
        _sum: { duration: boolean };
      }) => {
        const rows = current.value.sessions.filter((s) => {
          if (s.projectId !== args.where.projectId) return false;
          if (s.status !== args.where.status) return false;
          if (args.where.startTime && (s.startTime < args.where.startTime.gte || s.startTime > args.where.startTime.lte)) return false;
          return true;
        });
        const byUser = new Map<number, number>();
        for (const s of rows) byUser.set(s.userId, (byUser.get(s.userId) ?? 0) + (s.duration ?? 0));
        return [...byUser.entries()].map(([userId, total]) => ({ userId, _sum: { duration: total } }));
      },
    },
    projects: {
      findUnique: async (args: { where: { id: number } }) => current.value.projects.find((p) => p.id === args.where.id) ?? null,
      findFirst: async (args: { where: { leaderId: number; id: { not: number } } }) =>
        current.value.projects.find((p) => p.leaderId === args.where.leaderId && p.id !== args.where.id.not) ?? null,
      update: async (args: { where: { id: number }; data: { leaderId: number | null } }) => {
        const row = current.value.projects.find((p) => p.id === args.where.id)!;
        row.leaderId = args.data.leaderId;
        return { id: row.id, leaderId: row.leaderId };
      },
    },
    users: {
      findUnique: async (args: { where: { id: number } }) => current.value.users.find((u) => u.id === args.where.id) ?? null,
    },
  };

  return { current, prisma };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: harness.prisma }));

import { PrismaProjectMembershipGateway } from "@/backend/modules/project-membership/infrastructure/prisma-project-membership.gateway";
import { createProjectMembershipModule } from "@/backend/modules/project-membership";

// ------------------------------------------------------------------ new side (ports over the same world)

function makeNewModule() {
  const memberships = {
    listMembersWithUser: async (projectId: number) =>
      world.members
        .filter((m) => m.projectId === projectId)
        .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime())
        .map((m) => {
          const user = world.users.find((u) => u.id === m.userId);
          return {
            id: m.id,
            projectId: m.projectId,
            userId: m.userId,
            roles: m.roles,
            joinedAt: m.joinedAt,
            userName: user?.name ?? null,
            userEmail: user?.email ?? null,
          };
        }),
    findMembership: async (projectId: number, userId: number) => {
      const row = world.members.find((m) => m.projectId === projectId && m.userId === userId);
      return row ? { id: row.id, roles: row.roles } : null;
    },
    findMembershipById: async (membershipId: number, projectId: number) => {
      const row = world.members.find((m) => m.id === membershipId && m.projectId === projectId);
      if (!row) return null;
      const user = world.users.find((u) => u.id === row.userId);
      return { id: row.id, userId: row.userId, roles: row.roles, userName: user?.name ?? null };
    },
    countMembersWithRole: async (projectId: number, role: Role) =>
      world.members.filter((m) => m.projectId === projectId && m.roles.includes(role)).length,
    createMembership: async (input: { projectId: number; userId: number; roles: Role[] }) => {
      const row: MemberRow = {
        id: world.nextMemberId++,
        projectId: input.projectId,
        userId: input.userId,
        roles: input.roles,
        joinedAt: new Date(),
      };
      world.members.push(row);
      const user = world.users.find((u) => u.id === row.userId);
      return {
        id: row.id,
        projectId: row.projectId,
        userId: row.userId,
        roles: row.roles,
        joinedAt: row.joinedAt,
        userName: user?.name ?? null,
        userEmail: user?.email ?? null,
      };
    },
    updateMembershipRoles: async (membershipId: number, roles: Role[]) => {
      const row = world.members.find((m) => m.id === membershipId)!;
      row.roles = roles;
      const user = world.users.find((u) => u.id === row.userId);
      return {
        id: row.id,
        projectId: row.projectId,
        userId: row.userId,
        roles: row.roles,
        joinedAt: row.joinedAt,
        userName: user?.name ?? null,
        userEmail: user?.email ?? null,
      };
    },
    deleteMembership: async (membershipId: number) => {
      const idx = world.members.findIndex((m) => m.id === membershipId);
      if (idx >= 0) world.members.splice(idx, 1);
    },
  };

  const access = {
    projectExists: async (projectId: number) => world.projects.some((p) => p.id === projectId),
    userExists: async (userId: number) => world.users.some((u) => u.id === userId),
    leadsAnotherProject: async (targetUserId: number, projectId: number) =>
      world.projects.some((p) => p.leaderId === targetUserId && p.id !== projectId),
    setProjectLeader: async (projectId: number, leaderId: number | null) => {
      const row = world.projects.find((p) => p.id === projectId)!;
      row.leaderId = leaderId;
      return { projectId: row.id, leaderId: row.leaderId };
    },
  };

  const hours = {
    sumCompletedSecondsByUser: async (projectId: number, window?: { start: Date; end: Date }) => {
      const byUser = new Map<number, number>();
      for (const s of world.sessions) {
        if (s.projectId !== projectId || s.status !== "completed") continue;
        if (window && (s.startTime < window.start || s.startTime > window.end)) continue;
        byUser.set(s.userId, (byUser.get(s.userId) ?? 0) + (s.duration ?? 0));
      }
      return [...byUser.entries()].map(([userId, seconds]) => ({ userId, seconds }));
    },
  };

  return createProjectMembershipModule({ ports: { memberships, access, hours } });
}

// ------------------------------------------------------------------ parity runner

const T_13Z = "2026-06-15T13:00:00.000Z";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function storeSnapshot(): unknown {
  return json({
    members: world.members,
    users: world.users,
    sessions: world.sessions,
    projects: world.projects,
  });
}

const legacyGateway = new PrismaProjectMembershipGateway();
const newModule = makeNewModule();

async function runParity(
  setup: (w: World) => void,
  call: (service: PrismaProjectMembershipGateway & ReturnType<typeof makeNewModule>) => Promise<unknown>,
) {
  // old side
  world = seedWorld();
  setup(world);
  harness.current.value = world;
  let oldResult: unknown;
  let oldError: string | null = null;
  try {
    oldResult = await call(legacyGateway as never);
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
    newResult = await call(newModule as never);
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

describe("contract parity — listProjectMembers", () => {
  it("COORDENADOR views without membership", () =>
    runParity(
      () => undefined,
      (service) => service.listProjectMembers({ projectId: 5, actorUserId: 7, actorRoles: ["COORDENADOR"] as never }),
    ));

  it("plain member views", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) => service.listProjectMembers({ projectId: 5, actorUserId: 7, actorRoles: ["VOLUNTARIO"] as never }),
    ));

  it("non-member without global role -> 'Acesso negado ao projeto'", () =>
    runParity(
      () => undefined,
      (service) => service.listProjectMembers({ projectId: 5, actorUserId: 8, actorRoles: ["VOLUNTARIO"] as never }),
    ));

  it("joinedAt DESC + rounded total/week hours (completed only)", () =>
    runParity(
      (w) => {
        w.members.push(
          { id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") },
          { id: 2, projectId: 5, userId: 8, roles: ["COLABORADOR"], joinedAt: new Date("2026-06-10T12:00:00.000Z") },
        );
        w.sessions.push(
          { id: 1, userId: 7, projectId: 5, status: "completed", duration: 5400, startTime: new Date("2026-06-15T12:00:00.000Z") },
          { id: 2, userId: 7, projectId: 5, status: "completed", duration: 100, startTime: new Date("2026-06-15T11:00:00.000Z") },
          { id: 3, userId: 7, projectId: 5, status: "active", duration: null, startTime: new Date("2026-06-15T12:30:00.000Z") },
          { id: 4, userId: 7, projectId: 5, status: "completed", duration: 3600, startTime: new Date("2026-05-01T12:00:00.000Z") },
        );
      },
      (service) => service.listProjectMembers({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never }),
    ));
});

describe("contract parity — addProjectMember", () => {
  it("COORDENADOR adds (normalized roles, view + store)", () =>
    runParity(
      () => undefined,
      (service) =>
        service.addProjectMember({
          projectId: 5,
          actorUserId: 9,
          actorRoles: ["COORDENADOR"] as never,
          targetUserId: 7,
          roles: ["VOLUNTARIO", "BOGUS"] as never,
        }),
    ));

  it("GERENTE_PROJETO membership manages", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) =>
        service.addProjectMember({ projectId: 5, actorUserId: 7, actorRoles: ["VOLUNTARIO"] as never, targetUserId: 8, roles: ["VOLUNTARIO"] as never }),
    ));

  it("QUIRK: membership [COORDENADOR] (no GERENTE_PROJETO) rejected", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["COORDENADOR"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) =>
        service.addProjectMember({ projectId: 5, actorUserId: 7, actorRoles: ["VOLUNTARIO"] as never, targetUserId: 8, roles: ["VOLUNTARIO"] as never }),
    ));

  it("empty roles -> 'userId e roles são obrigatórios'", () =>
    runParity(
      () => undefined,
      (service) =>
        service.addProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7, roles: [] as never }),
    ));

  it("invalid-only roles -> 'Nenhum papel válido informado'", () =>
    runParity(
      () => undefined,
      (service) =>
        service.addProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7, roles: ["BOGUS"] as never }),
    ));

  it("unknown project -> 'Projeto não encontrado'", () =>
    runParity(
      () => undefined,
      (service) =>
        service.addProjectMember({ projectId: 99, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7, roles: ["VOLUNTARIO"] as never }),
    ));

  it("unknown user -> 'Usuário não encontrado'", () =>
    runParity(
      () => undefined,
      (service) =>
        service.addProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 99, roles: ["VOLUNTARIO"] as never }),
    ));

  it("duplicate -> 'Usuário já é membro deste projeto'", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) =>
        service.addProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7, roles: ["VOLUNTARIO"] as never }),
    ));
});

describe("contract parity — upsertProjectMemberRoles", () => {
  it("existing membership: roles replaced", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) =>
        service.upsertProjectMemberRoles({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7, roles: ["COLABORADOR"] as never }),
    ));

  it("no membership: created", () =>
    runParity(
      () => undefined,
      (service) =>
        service.upsertProjectMemberRoles({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 8, roles: ["PESQUISADOR"] as never }),
    ));

  it("gate message", () =>
    runParity(
      () => undefined,
      (service) =>
        service.upsertProjectMemberRoles({ projectId: 5, actorUserId: 7, actorRoles: ["VOLUNTARIO"] as never, targetUserId: 8, roles: ["VOLUNTARIO"] as never }),
    ));
});

describe("contract parity — assignProjectLeader", () => {
  it("target without membership: GERENTE_PROJETO membership created + leaderId set", () =>
    runParity(
      () => undefined,
      (service) => service.assignProjectLeader({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7 }),
    ));

  it("existing membership without GERENTE_PROJETO: role merged", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) => service.assignProjectLeader({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7 }),
    ));

  it("existing GERENTE_PROJETO membership: untouched", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO", "GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) => service.assignProjectLeader({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7 }),
    ));

  it("null clears leaderId with no membership writes", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
        w.projects[0].leaderId = 7;
      },
      (service) => service.assignProjectLeader({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: null }),
    ));

  it("leader of another project -> frozen conflict message", () =>
    runParity(
      (w) => {
        w.projects.push({ id: 6, leaderId: 7, createdBy: 9 });
      },
      (service) => service.assignProjectLeader({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7 }),
    ));

  it("unknown user -> 'Usuário não encontrado'", () =>
    runParity(
      () => undefined,
      (service) => service.assignProjectLeader({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 99 }),
    ));

  it("gate message", () =>
    runParity(
      () => undefined,
      (service) => service.assignProjectLeader({ projectId: 5, actorUserId: 7, actorRoles: ["VOLUNTARIO"] as never, targetUserId: 8 }),
    ));
});

describe("contract parity — removeProjectMember", () => {
  it("removes a regular member (memberName + store)", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) => service.removeProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, membershipId: 1 }),
    ));

  it("membership outside the project -> 'Membro não encontrado no projeto'", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 6, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) => service.removeProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, membershipId: 1 }),
    ));

  it("last GERENTE_PROJETO -> removal rejected", () =>
    runParity(
      (w) => {
        w.members.push({ id: 1, projectId: 5, userId: 7, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
      },
      (service) => service.removeProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, membershipId: 1 }),
    ));

  it("two GERENTE_PROJETO: one can go", () =>
    runParity(
      (w) => {
        w.members.push(
          { id: 1, projectId: 5, userId: 7, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") },
          { id: 2, projectId: 5, userId: 8, roles: ["GERENTE_PROJETO", "VOLUNTARIO"], joinedAt: new Date("2026-06-02T12:00:00.000Z") },
        );
      },
      (service) => service.removeProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, membershipId: 1 }),
    ));

  it("gate message", () =>
    runParity(
      () => undefined,
      (service) => service.removeProjectMember({ projectId: 5, actorUserId: 7, actorRoles: ["VOLUNTARIO"] as never, membershipId: 1 }),
    ));
});
