// @vitest-environment node
/**
 * OND5-B1 (R0) — golden/characterization matrix of `PrismaProjectMembershipGateway`
 * (376 lines) BEFORE the Onda 5 refactor touches it. Frozen behaviors (incl. quirks):
 *
 *   - ACL: view = COORDENADOR/GERENTE (global) OR any membership; manage = COORDENADOR/
 *     GERENTE OR membership whose roles include GERENTE_PROJETO. QUIRK: a membership with
 *     roles [COORDENADOR] does NOT grant manage (only GERENTE_PROJETO counts).
 *   - listProjectMembers: joinedAt DESC; totalHours/currentWeekHours = SUM(duration of
 *     COMPLETED sessions)/3600 rounded to 2 decimals; the week window is Monday-based on
 *     the LOCAL clock (startOfWeek = now - (getDay()+6)%7 days at 00:00 local).
 *   - addProjectMember: gate/validate messages frozen; roles go through normalizeRoles
 *     (invalid-only -> "Nenhum papel válido informado"); duplicate membership rejected.
 *   - upsertProjectMemberRoles: updates roles when the membership exists, CREATES it
 *     otherwise (no duplicate guard needed).
 *   - assignProjectLeader: target null clears leaderId with NO membership writes; a target
 *     without membership is added with ["GERENTE_PROJETO"]; an existing membership gets
 *     GERENTE_PROJETO merged (dedup); leading two projects at once is rejected.
 *   - removeProjectMember: last-GERENTE_PROJETO guard counts memberships (not the project
 *     leaderId); returns { memberName } from the joined user.
 *
 * Seam: `@/lib/database/prisma` (fake in-memory). Clock frozen with vi fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  type MemberRow = { id: number; projectId: number; userId: number; roles: string[]; joinedAt: Date };
  type UserRow = { id: number; name: string; email: string };
  type SessionRow = { id: number; userId: number; projectId: number | null; status: string; duration: number | null; startTime: Date };
  type ProjectRow = { id: number; leaderId: number | null; createdBy: number };

  const state = {
    members: [] as MemberRow[],
    users: [] as UserRow[],
    sessions: [] as SessionRow[],
    projects: [] as ProjectRow[],
    nextMemberId: 500,
  };

  const withUser = (row: MemberRow) => {
    const user = state.users.find((u) => u.id === row.userId);
    return { ...row, user: user ? { id: user.id, name: user.name, email: user.email } : null };
  };

  const prisma = {
    project_members: {
      findMany: async (args: { where: { projectId: number }; orderBy?: { joinedAt: string } }) =>
        state.members
          .filter((m) => m.projectId === args.where.projectId)
          .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime())
          .map((m) => withUser(m)),
      findUnique: async (args: { where: { projectId_userId: { projectId: number; userId: number } } }) =>
        state.members.find(
          (m) => m.projectId === args.where.projectId_userId.projectId && m.userId === args.where.projectId_userId.userId,
        ) ?? null,
      create: async (args: { data: { projectId: number; userId: number; roles: string[] } }) => {
        const row: MemberRow = {
          id: state.nextMemberId++,
          projectId: args.data.projectId,
          userId: args.data.userId,
          roles: args.data.roles,
          joinedAt: new Date(),
        };
        state.members.push(row);
        return withUser(row);
      },
      update: async (args: { where: { id: number }; data: { roles?: string[] } }) => {
        const row = state.members.find((m) => m.id === args.where.id)!;
        if (args.data.roles) row.roles = args.data.roles;
        return withUser(row);
      },
      count: async (args: { where: { projectId: number; roles?: { has: string } } }) =>
        state.members.filter(
          (m) => m.projectId === args.where.projectId && (!args.where.roles || m.roles.includes(args.where.roles.has)),
        ).length,
      findFirst: async (args: { where: { id: number; projectId: number } }) => {
        const found = state.members.find((m) => m.id === args.where.id && m.projectId === args.where.projectId);
        return found ? withUser(found) : null;
      },
      delete: async (args: { where: { id: number } }) => {
        const idx = state.members.findIndex((m) => m.id === args.where.id);
        if (idx >= 0) state.members.splice(idx, 1);
      },
    },
    work_sessions: {
      groupBy: async (args: {
        by: ["userId"];
        where: { projectId: number; status: string; startTime?: { gte: Date; lte: Date } };
        _sum: { duration: boolean };
      }) => {
        const rows = state.sessions.filter((s) => {
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
      findUnique: async (args: { where: { id: number } }) =>
        state.projects.find((p) => p.id === args.where.id) ?? null,
      findFirst: async (args: { where: { leaderId: number; id: { not: number } } }) =>
        state.projects.find((p) => p.leaderId === args.where.leaderId && p.id !== args.where.id.not) ?? null,
      update: async (args: { where: { id: number }; data: { leaderId: number | null } }) => {
        const row = state.projects.find((p) => p.id === args.where.id)!;
        row.leaderId = args.data.leaderId;
        return { id: row.id, leaderId: row.leaderId };
      },
    },
    users: {
      findUnique: async (args: { where: { id: number } }) => state.users.find((u) => u.id === args.where.id) ?? null,
    },
  };

  function reset() {
    state.members = [];
    state.sessions = [];
    state.projects = [{ id: 5, leaderId: null, createdBy: 9 }];
    state.users = [
      { id: 7, name: "Ana", email: "ana@test.local" },
      { id: 8, name: "Beto", email: "beto@test.local" },
      { id: 9, name: "Coord", email: "coord@test.local" },
    ];
    state.nextMemberId = 500;
  }

  return { state, prisma, reset };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: harness.prisma }));

import { PrismaProjectMembershipGateway } from "@/backend/modules/project-membership/infrastructure/prisma-project-membership.gateway";

const T_13Z = "2026-06-15T13:00:00.000Z"; // Monday 10:00 America/Sao_Paulo

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

let gateway: PrismaProjectMembershipGateway;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(T_13Z));
  harness.reset();
  gateway = new PrismaProjectMembershipGateway();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("golden — listProjectMembers", () => {
  it("COORDENADOR/GERENTE view without any membership", async () => {
    for (const role of ["COORDENADOR", "GERENTE"]) {
      const result = await gateway.listProjectMembers({ projectId: 5, actorUserId: 7, actorRoles: [role] as never });
      expect(result).toEqual([]);
    }
  });

  it("any membership (even VOLUNTARIO) views; GERENTE_PROJETO too", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
    const result = await gateway.listProjectMembers({ projectId: 5, actorUserId: 7, actorRoles: ["VOLUNTARIO"] as never });
    expect(result).toHaveLength(1);
  });

  it("non-member without global role -> 'Acesso negado ao projeto'", async () => {
    await expect(
      gateway.listProjectMembers({ projectId: 5, actorUserId: 7, actorRoles: ["VOLUNTARIO"] as never }),
    ).rejects.toThrow("Acesso negado ao projeto");
  });

  it("rows ordered joinedAt DESC with hours rounded to 2 decimals (completed only)", async () => {
    harness.state.members.push(
      { id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") },
      { id: 2, projectId: 5, userId: 8, roles: ["COLABORADOR"], joinedAt: new Date("2026-06-10T12:00:00.000Z") },
    );
    harness.state.sessions.push(
      // Ana: 5400s + 100s completed this week (1.5277h -> 1.53) + active 7200s (excluded)
      { id: 1, userId: 7, projectId: 5, status: "completed", duration: 5400, startTime: new Date("2026-06-15T12:00:00.000Z") },
      { id: 2, userId: 7, projectId: 5, status: "completed", duration: 100, startTime: new Date("2026-06-15T11:00:00.000Z") },
      { id: 3, userId: 7, projectId: 5, status: "active", duration: null, startTime: new Date("2026-06-15T12:30:00.000Z") },
      // Ana old completed (total only, outside any week window)
      { id: 4, userId: 7, projectId: 5, status: "completed", duration: 3600, startTime: new Date("2026-05-01T12:00:00.000Z") },
    );

    const result = await gateway.listProjectMembers({ projectId: 5, actorUserId: 7, actorRoles: ["COORDENADOR"] as never });

    expect(result.map((m) => m.userId)).toEqual([8, 7]); // joinedAt DESC
    const ana = result.find((m) => m.userId === 7)!;
    expect(ana.totalHours).toBe(2.53); // (5400+100+3600)/3600
    expect(ana.currentWeekHours).toBe(1.53); // week window only
    expect(ana.userName).toBe("Ana");
    expect(ana.userEmail).toBe("ana@test.local");
    expect(ana.joinedAt).toBe("2026-06-01T12:00:00.000Z");

    const beto = result.find((m) => m.userId === 8)!;
    expect(beto.totalHours).toBe(0);
    expect(beto.currentWeekHours).toBe(0);
  });
});

describe("golden — addProjectMember", () => {
  it("COORDENADOR adds: normalized roles + view + row persisted", async () => {
    const view = await gateway.addProjectMember({
      projectId: 5,
      actorUserId: 9,
      actorRoles: ["COORDENADOR"] as never,
      targetUserId: 7,
      roles: ["VOLUNTARIO", "BOGUS"] as never,
    });

    expect(json(view)).toEqual({
      id: 500,
      userId: 7,
      userName: "Ana",
      userEmail: "ana@test.local",
      roles: ["VOLUNTARIO"],
      joinedAt: T_13Z,
    });
    expect(harness.state.members).toHaveLength(1);
    expect(harness.state.members[0].roles).toEqual(["VOLUNTARIO"]);
  });

  it("GERENTE_PROJETO membership manages (adds)", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
    const view = await gateway.addProjectMember({
      projectId: 5,
      actorUserId: 7,
      actorRoles: ["VOLUNTARIO"] as never,
      targetUserId: 8,
      roles: ["VOLUNTARIO"] as never,
    });
    expect(view.userId).toBe(8);
  });

  it("QUIRK: membership with roles [COORDENADOR] (no GERENTE_PROJETO) does NOT manage", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["COORDENADOR"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
    await expect(
      gateway.addProjectMember({ projectId: 5, actorUserId: 7, actorRoles: ["VOLUNTARIO"] as never, targetUserId: 8, roles: ["VOLUNTARIO"] as never }),
    ).rejects.toThrow("Apenas coordenadores, gerentes ou gerente do projeto podem adicionar membros");
  });

  it("empty/undefined roles -> 'userId e roles são obrigatórios'", async () => {
    await expect(
      gateway.addProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7, roles: [] as never }),
    ).rejects.toThrow("userId e roles são obrigatórios");
  });

  it("invalid-only roles -> 'Nenhum papel válido informado'", async () => {
    await expect(
      gateway.addProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7, roles: ["BOGUS"] as never }),
    ).rejects.toThrow("Nenhum papel válido informado");
  });

  it("unknown project -> 'Projeto não encontrado'", async () => {
    await expect(
      gateway.addProjectMember({ projectId: 99, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7, roles: ["VOLUNTARIO"] as never }),
    ).rejects.toThrow("Projeto não encontrado");
  });

  it("unknown target user -> 'Usuário não encontrado'", async () => {
    await expect(
      gateway.addProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 99, roles: ["VOLUNTARIO"] as never }),
    ).rejects.toThrow("Usuário não encontrado");
  });

  it("duplicate membership -> 'Usuário já é membro deste projeto'", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
    await expect(
      gateway.addProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7, roles: ["VOLUNTARIO"] as never }),
    ).rejects.toThrow("Usuário já é membro deste projeto");
  });
});

describe("golden — upsertProjectMemberRoles", () => {
  it("existing membership: roles REPLACED, joinedAt preserved", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });

    const view = await gateway.upsertProjectMemberRoles({
      projectId: 5,
      actorUserId: 9,
      actorRoles: ["COORDENADOR"] as never,
      targetUserId: 7,
      roles: ["COLABORADOR"] as never,
    });

    expect(json(view)).toEqual({
      id: 1,
      userId: 7,
      userName: "Ana",
      userEmail: "ana@test.local",
      roles: ["COLABORADOR"],
      joinedAt: "2026-06-01T12:00:00.000Z",
    });
  });

  it("no membership: CREATES it (upsert semantics)", async () => {
    const view = await gateway.upsertProjectMemberRoles({
      projectId: 5,
      actorUserId: 9,
      actorRoles: ["COORDENADOR"] as never,
      targetUserId: 8,
      roles: ["PESQUISADOR"] as never,
    });
    expect(view.id).toBe(500);
    expect(harness.state.members.map((m) => m.roles)).toEqual([["PESQUISADOR"]]);
  });

  it("gate message '...podem atualizar papéis'", async () => {
    await expect(
      gateway.upsertProjectMemberRoles({ projectId: 5, actorUserId: 7, actorRoles: ["VOLUNTARIO"] as never, targetUserId: 8, roles: ["VOLUNTARIO"] as never }),
    ).rejects.toThrow("Apenas coordenadores, gerentes ou gerente do projeto podem atualizar papéis");
  });

  it("invalid-only roles -> 'Nenhum papel válido informado'", async () => {
    await expect(
      gateway.upsertProjectMemberRoles({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7, roles: ["NOPE"] as never }),
    ).rejects.toThrow("Nenhum papel válido informado");
  });
});

describe("golden — assignProjectLeader", () => {
  it("target without membership: membership created with GERENTE_PROJETO + leaderId set", async () => {
    const view = await gateway.assignProjectLeader({
      projectId: 5,
      actorUserId: 9,
      actorRoles: ["COORDENADOR"] as never,
      targetUserId: 7,
    });

    expect(view).toEqual({ projectId: 5, leaderId: 7 });
    expect(harness.state.members).toHaveLength(1);
    expect(harness.state.members[0].roles).toEqual(["GERENTE_PROJETO"]);
    expect(harness.state.projects[0].leaderId).toBe(7);
  });

  it("existing membership without GERENTE_PROJETO: role merged (dedup)", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO", "GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });

    const view = await gateway.assignProjectLeader({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7 });

    expect(view).toEqual({ projectId: 5, leaderId: 7 });
    expect(harness.state.members[0].roles).toEqual(["VOLUNTARIO", "GERENTE_PROJETO"]); // no duplicate append
  });

  it("existing membership missing GERENTE_PROJETO: role appended", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });

    await gateway.assignProjectLeader({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7 });

    expect(harness.state.members[0].roles).toEqual(["VOLUNTARIO", "GERENTE_PROJETO"]);
  });

  it("target null: clears leaderId with NO membership writes", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });
    harness.state.projects[0].leaderId = 7;

    const view = await gateway.assignProjectLeader({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: null });

    expect(view).toEqual({ projectId: 5, leaderId: null });
    expect(harness.state.members[0].roles).toEqual(["GERENTE_PROJETO"]); // membership untouched
    expect(harness.state.members).toHaveLength(1); // no new row
  });

  it("user already leading ANOTHER project -> frozen conflict message", async () => {
    harness.state.projects.push({ id: 6, leaderId: 7, createdBy: 9 });

    await expect(
      gateway.assignProjectLeader({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7 }),
    ).rejects.toThrow("Este usuário já é líder de outro projeto. Um usuário só pode ser líder de um projeto por vez.");
  });

  it("unknown target user -> 'Usuário não encontrado'", async () => {
    await expect(
      gateway.assignProjectLeader({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 99 }),
    ).rejects.toThrow("Usuário não encontrado");
  });

  it("gate message '...podem definir líder'", async () => {
    await expect(
      gateway.assignProjectLeader({ projectId: 5, actorUserId: 7, actorRoles: ["VOLUNTARIO"] as never, targetUserId: 8 }),
    ).rejects.toThrow("Apenas coordenadores, gerentes ou gerente do projeto podem definir líder");
  });

  it("unknown project -> 'Projeto não encontrado'", async () => {
    await expect(
      gateway.assignProjectLeader({ projectId: 99, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, targetUserId: 7 }),
    ).rejects.toThrow("Projeto não encontrado");
  });
});

describe("golden — removeProjectMember", () => {
  it("removes a regular member and returns { memberName }", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });

    const result = await gateway.removeProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, membershipId: 1 });

    expect(result).toEqual({ memberName: "Ana" });
    expect(harness.state.members).toHaveLength(0);
  });

  it("membership id outside the project -> 'Membro não encontrado no projeto'", async () => {
    harness.state.members.push({ id: 1, projectId: 6, userId: 7, roles: ["VOLUNTARIO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });

    await expect(
      gateway.removeProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, membershipId: 1 }),
    ).rejects.toThrow("Membro não encontrado no projeto");
  });

  it("last GERENTE_PROJETO membership -> removal rejected (counted by memberships)", async () => {
    harness.state.members.push({ id: 1, projectId: 5, userId: 7, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") });

    await expect(
      gateway.removeProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, membershipId: 1 }),
    ).rejects.toThrow("Não é possível remover o último gerente do projeto");
    expect(harness.state.members).toHaveLength(1);
  });

  it("two GERENTE_PROJETO memberships: one can go", async () => {
    harness.state.members.push(
      { id: 1, projectId: 5, userId: 7, roles: ["GERENTE_PROJETO"], joinedAt: new Date("2026-06-01T12:00:00.000Z") },
      { id: 2, projectId: 5, userId: 8, roles: ["GERENTE_PROJETO", "VOLUNTARIO"], joinedAt: new Date("2026-06-02T12:00:00.000Z") },
    );

    const result = await gateway.removeProjectMember({ projectId: 5, actorUserId: 9, actorRoles: ["COORDENADOR"] as never, membershipId: 1 });

    expect(result).toEqual({ memberName: "Ana" });
    expect(harness.state.members.map((m) => m.id)).toEqual([2]);
  });

  it("gate message '...podem remover membros'", async () => {
    await expect(
      gateway.removeProjectMember({ projectId: 5, actorUserId: 7, actorRoles: ["VOLUNTARIO"] as never, membershipId: 1 }),
    ).rejects.toThrow("Apenas coordenadores, gerentes ou gerente do projeto podem remover membros");
  });
});
