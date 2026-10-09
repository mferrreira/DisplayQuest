// @vitest-environment node
/**
 * OND5-B4 — G4 roundtrip smoke of the project modules against the ISOLATED test DB
 * (127.0.0.1:5433 — DEC-10/BLOCKER-02; never 5432).
 *
 * Exercises the NEW wiring end-to-end with real Prisma (no mocks):
 *   createProject (creator/leader/volunteer memberships + createdAt stamp) ->
 *   listProjectsForActor (laboratório aberto + union dedup) -> getProjectForActor /
 *   canActorAccessProject -> membership module: listProjectMembers (joinedAt DESC +
 *   completed-session hours), addProjectMember (+ duplicate conflict), upsertProjectMemberRoles,
 *   assignProjectLeader (GERENTE_PROJETO merge + single-leader conflict), removeProjectMember
 *   (+ last-manager guard) -> updateProject (quirks + repository-level validation message) ->
 *   getProjectVolunteers (audience + rounded hours) -> deleteProject (status gate + delete).
 *
 * Modules are built with `createProjectManagementModule()` / `createProjectMembershipModule()`
 * exactly as the composition root builds them (use cases over the thin Prisma adapters).
 *
 * Only rows created by this file are removed in afterAll (work_sessions first — its FK to
 * projects has NO cascade; project_members cascades with the project; notifications cascade
 * with users).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { userActor } from "@/backend/domain";
import { createProjectManagementModule } from "@/backend/modules/project-management";
import { createProjectMembershipModule } from "@/backend/modules/project-membership";

const projectModule = createProjectManagementModule();
const membershipModule = createProjectMembershipModule();

const stamp = Date.now();
let anaId = 0;
let betoId = 0;
let leaderId = 0;
let coordId = 0;
let outsiderId = 0;
let projectId = 0;
let secondProjectId = 0;
const createdSessionIds: number[] = [];

describe("G4 roundtrip — project-management + project-membership (isolated test DB)", () => {
  beforeAll(async () => {
    const ana = await prisma.users.create({
      data: {
        name: `G5 Ana ${stamp}`,
        email: `g5-projects-ana-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });
    const beto = await prisma.users.create({
      data: {
        name: `G5 Beto ${stamp}`,
        email: `g5-projects-beto-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["COLABORADOR"],
      },
      select: { id: true },
    });
    const leader = await prisma.users.create({
      data: {
        name: `G5 Leader ${stamp}`,
        email: `g5-projects-leader-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: [], // NO global roles: manages ONLY via GERENTE_PROJETO membership
      },
      select: { id: true },
    });
    const coord = await prisma.users.create({
      data: {
        name: `G5 Coord ${stamp}`,
        email: `g5-projects-coord-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["COORDENADOR"],
      },
      select: { id: true },
    });
    const outsider = await prisma.users.create({
      data: {
        name: `G5 Outsider ${stamp}`,
        email: `g5-projects-outsider-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });

    anaId = ana.id;
    betoId = beto.id;
    leaderId = leader.id;
    coordId = coord.id;
    outsiderId = outsider.id;
  });

  afterAll(async () => {
    // work_sessions -> projects FK has NO onDelete: delete sessions first.
    if (createdSessionIds.length > 0) {
      await prisma.work_sessions.deleteMany({ where: { id: { in: createdSessionIds } } });
    }
    for (const id of [projectId, secondProjectId]) {
      if (id) {
        await prisma.project_members.deleteMany({ where: { projectId: id } });
        await prisma.projects.delete({ where: { id } });
      }
    }
    for (const id of [anaId, betoId, leaderId, coordId, outsiderId]) {
      if (id) await prisma.users.delete({ where: { id } }); // notifications cascade
    }
  });

  it("createProject: record + creator/leader/volunteer memberships + server-clock createdAt", async () => {
    const project = await projectModule.createProject({
      // B6-3 (D4): o gate MANAGE_PROJECTS desceu para o use case; coordId e COORDENADOR na
      // semente deste roundtrip — o ator e a pessoa que ja criava o projeto.
      actor: userActor(coordId, ["COORDENADOR"]),
      actorId: coordId,
      data: {
        name: `G5 Project ${stamp}`,
        description: "roundtrip",
        status: "active" as never,
        leaderId,
        links: [{ label: "repo", url: "https://example.local" }],
      },
      volunteerIds: [anaId, anaId, betoId, 0, -1, coordId, leaderId],
    });
    projectId = project.id!;

    const row = await prisma.projects.findUnique({ where: { id: projectId } });
    expect(row).not.toBeNull();
    expect(row?.createdBy).toBe(coordId);
    expect(row?.leaderId).toBe(leaderId);
    expect(row?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // projects.createdAt is a String column (frozen schema)

    const memberships = await prisma.project_members.findMany({ where: { projectId } });
    const byUser = new Map(memberships.map((m) => [m.userId, m.roles]));
    expect([...byUser.keys()].sort()).toEqual([anaId, betoId, coordId, leaderId].sort());
    expect(byUser.get(coordId)).toEqual(["GERENTE_PROJETO"]); // creator
    expect(byUser.get(leaderId)).toEqual(["GERENTE_PROJETO"]); // leader !== actor
    expect(byUser.get(anaId)).toEqual(["VOLUNTARIO"]); // deduped, once
    expect(byUser.get(betoId)).toEqual(["VOLUNTARIO"]);
  });

  it("listProjectsForActor: COLABORADOR (MANAGE_TASKS) sees ALL; Ana sees her project", async () => {
    const forBeto = await projectModule.listProjectsForActor({ actorId: betoId, actorRoles: ["COLABORADOR"] });
    expect(forBeto.map((p) => p.id)).toContain(projectId);

    const forAna = await projectModule.listProjectsForActor({ actorId: anaId, actorRoles: ["VOLUNTARIO"] });
    expect(forAna.map((p) => p.id)).toEqual([projectId]); // member UNION created UNION led, deduped

    const detail = forAna[0];
    expect(detail.memberCount).toBe(4); // adapter joins _count.members
    expect(detail.members?.map((m) => m.userId).sort()).toEqual([anaId, betoId, coordId, leaderId].sort());
  });

  it("getProjectForActor + canActorAccessProject: member/leader yes, outsider denied", async () => {
    const viaLeader = await projectModule.getProjectForActor({ projectId, actorId: leaderId, actorRoles: [] });
    expect(viaLeader.id).toBe(projectId); // leaderId relation grants access

    await expect(
      projectModule.getProjectForActor({ projectId, actorId: outsiderId, actorRoles: ["VOLUNTARIO"] }),
    ).rejects.toThrow("Acesso negado ao projeto");

    expect(await projectModule.canActorAccessProject(projectId, anaId, ["VOLUNTARIO"])).toBe(true);
    expect(await projectModule.canActorAccessProject(projectId, outsiderId, ["VOLUNTARIO"])).toBe(false);
  });

  it("listProjectMembers: joinedAt DESC + completed-session hours rounded to 2 decimals", async () => {
    const session = await prisma.work_sessions.create({
      data: {
        userId: anaId,
        userName: `G5 Ana ${stamp}`,
        projectId,
        status: "completed",
        duration: 5500, // 1.5277h -> 1.53
        startTime: new Date(),
        endTime: new Date(),
      },
      select: { id: true },
    });
    createdSessionIds.push(session.id);

    const members = await membershipModule.listProjectMembers({
      projectId,
      actorUserId: anaId,
      actorRoles: ["VOLUNTARIO"],
    });

    expect(members.map((m) => m.userId).sort()).toEqual([anaId, betoId, coordId, leaderId].sort());
    const joinedAt = members.map((m) => m.joinedAt);
    expect([...joinedAt].sort().reverse()).toEqual(joinedAt); // joinedAt DESC
    const ana = members.find((m) => m.userId === anaId)!;
    expect(ana.totalHours).toBe(1.53);
    expect(ana.currentWeekHours).toBe(1.53); // created now -> inside the Monday-based week
    expect(ana.userName).toBe(`G5 Ana ${stamp}`);

    await expect(
      membershipModule.listProjectMembers({ projectId, actorUserId: outsiderId, actorRoles: ["VOLUNTARIO"] }),
    ).rejects.toThrow("Acesso negado ao projeto");
  });

  it("addProjectMember: coord adds the outsider; duplicate rejected; plain member cannot manage", async () => {
    const membership = await membershipModule.addProjectMember({
      projectId,
      actorUserId: coordId,
      actorRoles: ["COORDENADOR"],
      targetUserId: outsiderId,
      roles: ["VOLUNTARIO", "BOGUS"] as never,
    });
    expect(membership.userId).toBe(outsiderId);
    expect(membership.roles).toEqual(["VOLUNTARIO"]); // normalizeRoles dropped BOGUS
    expect(typeof membership.joinedAt).toBe("string"); // view serializes the DateTime as ISO

    await expect(
      membershipModule.addProjectMember({
        projectId,
        actorUserId: coordId,
        actorRoles: ["COORDENADOR"],
        targetUserId: outsiderId,
        roles: ["VOLUNTARIO"],
      }),
    ).rejects.toThrow("Usuário já é membro deste projeto");

    await expect(
      membershipModule.addProjectMember({
        projectId,
        actorUserId: anaId,
        actorRoles: ["VOLUNTARIO"],
        targetUserId: outsiderId,
        roles: ["VOLUNTARIO"],
      }),
    ).rejects.toThrow("Apenas coordenadores, gerentes ou gerente do projeto podem adicionar membros");
  });

  it("upsertProjectMemberRoles: roles REPLACED for an existing membership", async () => {
    const membership = await membershipModule.upsertProjectMemberRoles({
      projectId,
      actorUserId: coordId,
      actorRoles: ["COORDENADOR"],
      targetUserId: anaId,
      roles: ["COLABORADOR"],
    });
    expect(membership.roles).toEqual(["COLABORADOR"]);

    const row = await prisma.project_members.findUnique({ where: { projectId_userId: { projectId, userId: anaId } } });
    expect(row?.roles).toEqual(["COLABORADOR"]);
  });

  it("assignProjectLeader: GERENTE_PROJETO merged on Ana; single-leader conflict on the 2nd project", async () => {
    const leader = await membershipModule.assignProjectLeader({
      projectId,
      actorUserId: coordId,
      actorRoles: ["COORDENADOR"],
      targetUserId: anaId,
    });
    expect(leader).toEqual({ projectId, leaderId: anaId });

    const anaMembership = await prisma.project_members.findUnique({ where: { projectId_userId: { projectId, userId: anaId } } });
    expect(anaMembership?.roles).toEqual(["COLABORADOR", "GERENTE_PROJETO"]); // merged, order preserved

    // Ana now leads `projectId` -> she cannot lead a second project.
    const second = await projectModule.createProject({
      actor: userActor(coordId, ["COORDENADOR"]),
      actorId: coordId,
      data: { name: `G5 Project 2 ${stamp}`, status: "active" as never },
    });
    secondProjectId = second.id!;

    await expect(
      membershipModule.assignProjectLeader({
        projectId: secondProjectId,
        actorUserId: coordId,
        actorRoles: ["COORDENADOR"],
        targetUserId: anaId,
      }),
    ).rejects.toThrow("Este usuário já é líder de outro projeto. Um usuário só pode ser líder de um projeto por vez.");

    // GERENTE_PROJETO membership (Ana, no global roles) can manage members of her project:
    // upserting Beto's roles goes through the membership-level manage gate.
    const upserted = await membershipModule.upsertProjectMemberRoles({
      projectId,
      actorUserId: anaId,
      actorRoles: ["VOLUNTARIO"],
      targetUserId: betoId,
      roles: ["PESQUISADOR"],
    });
    expect(upserted.roles).toEqual(["PESQUISADOR"]);
  });

  it("removeProjectMember: regular member goes; last GERENTE_PROJETO is guarded", async () => {
    const betoMembership = await prisma.project_members.findUnique({ where: { projectId_userId: { projectId, userId: betoId } } });
    const removed = await membershipModule.removeProjectMember({
      projectId,
      actorUserId: coordId,
      actorRoles: ["COORDENADOR"],
      membershipId: betoMembership!.id,
    });
    expect(removed.memberName).toBe(`G5 Beto ${stamp}`);
    expect(await prisma.project_members.findUnique({ where: { id: betoMembership!.id } })).toBeNull();

    // On the 2nd project the creator (coord) is the ONLY GERENTE_PROJETO membership.
    const coordMembership = await prisma.project_members.findFirst({ where: { projectId: secondProjectId, userId: coordId } });
    await expect(
      membershipModule.removeProjectMember({
        projectId: secondProjectId,
        actorUserId: coordId,
        actorRoles: ["COORDENADOR"],
        membershipId: coordMembership!.id,
      }),
    ).rejects.toThrow("Não é possível remover o último gerente do projeto");
  });

  it("updateProject: quirks + repository-level validation message + manage gate", async () => {
    const updated = await projectModule.updateProject({
      projectId,
      actorId: leaderId, // GERENTE_PROJETO membership, NO global roles
      data: { name: `G5 Project Renamed ${stamp}`, description: "" },
    });
    expect(updated.name).toBe(`G5 Project Renamed ${stamp}`);
    expect(updated.description).toBeNull(); // falsy -> null

    await expect(
      projectModule.updateProject({ projectId, actorId: outsiderId, data: { name: "nope" } }),
    ).rejects.toThrow("Usuário não tem permissão para gerenciar este projeto");

    await expect(
      projectModule.updateProject({ projectId, actorId: coordId, data: { status: "weird-status" as never } }),
    ).rejects.toThrow("Dados inválidos: Status do projeto inválido");
  });

  it("getProjectVolunteers: VOLUNTARIO/COLABORADOR audience with rounded hours + totals", async () => {
    const result = await projectModule.getProjectVolunteers({
      projectId,
      actorId: coordId,
      actorRoles: ["COORDENADOR"],
    });

    const ids = result.volunteers.map((v) => v.id);
    expect(ids).toContain(anaId); // COLABORADOR (+GERENTE_PROJETO) -> audience, role = roles[0]
    expect(ids).not.toContain(coordId); // GERENTE_PROJETO-only membership -> filtered
    expect(ids).not.toContain(betoId); // removed above

    const ana = result.volunteers.find((v) => v.id === anaId)!;
    expect(ana.role).toBe("COLABORADOR");
    expect(ana.hoursWorked).toBe(1.53);
    expect(ana.currentWeekHours).toBe(1.53);
    expect(ana.lastActivity).toBe(new Date().toISOString().split("T")[0]);

    expect(result.stats.totalVolunteers).toBe(result.volunteers.length);

    await expect(
      projectModule.getProjectVolunteers({ projectId, actorId: outsiderId, actorRoles: ["VOLUNTARIO"] }),
    ).rejects.toThrow("Acesso negado ao projeto");
  });

  it("deleteProject: completed status is protected; active can go", async () => {
    await projectModule.updateProject({ projectId, actorId: coordId, data: { status: "completed" as never } });

    await expect(projectModule.deleteProject({ projectId, actorId: coordId })).rejects.toThrow(
      "Projeto não pode ser excluído no status atual",
    );

    await projectModule.updateProject({ projectId, actorId: coordId, data: { status: "archived" as never } });

    // The work_sessions -> projects FK action is not relied upon: drop the sessions first.
    await prisma.work_sessions.deleteMany({ where: { id: { in: createdSessionIds } } });
    createdSessionIds.length = 0;

    await projectModule.deleteProject({ projectId, actorId: coordId });

    expect(await prisma.projects.findUnique({ where: { id: projectId } })).toBeNull();
    expect(await prisma.project_members.findMany({ where: { projectId } })).toHaveLength(0); // cascade
    projectId = 0; // already deleted -> afterAll skips it
  });
});
