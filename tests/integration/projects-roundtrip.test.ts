// @vitest-environment node
/**
 * OND5-B4 — G4 roundtrip smoke of the project modules against the ISOLATED test DB
 * (127.0.0.1:5433 — DEC-10/BLOCKER-02; never 5432).
 *
 * Exercises the NEW wiring end-to-end with real Prisma (no mocks):
 *   createProject (creator/leader/volunteer memberships + createdAt stamp) ->
 *   listProjectsForActor (V5-2a: qualquer autenticado vê todos) -> getProjectForActor ->
 *   membership module: listProjectMembers (joinedAt DESC +
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
    // V5-2b: migration nullable, sem backfill — projeto criado sem os campos novos nasce
    // sem período e com o saldo do default da coluna.
    expect(row?.startDate).toBeNull();
    expect(row?.endDate).toBeNull();
    expect(row?.points).toBe(0);

    const memberships = await prisma.project_members.findMany({ where: { projectId } });
    const byUser = new Map(memberships.map((m) => [m.userId, m.roles]));
    expect([...byUser.keys()].sort()).toEqual([anaId, betoId, coordId, leaderId].sort());
    expect(byUser.get(coordId)).toEqual(["GERENTE_PROJETO"]); // creator
    expect(byUser.get(leaderId)).toEqual(["GERENTE_PROJETO"]); // leader !== actor
    expect(byUser.get(anaId)).toEqual(["VOLUNTARIO"]); // deduped, once
    expect(byUser.get(betoId)).toEqual(["VOLUNTARIO"]);
  });

  it("campos de dados do projeto (V5-2b): data civil normalizada, edital/processo, e `points` fora do update", async () => {
    const updated = await projectModule.updateProject({
      projectId,
      actorId: coordId,
      data: {
        startDate: "2026-02-01",
        endDate: "2026-10-14T02:00:00.000Z", // ainda 13/10 em America/Sao_Paulo
        editalNumber: "EDITAL 12/2026",
        processNumber: "IFNMG-2026/0042",
        proppiNumber: "2026.01.001", // V5-4a (DEC-140)
        points: 99999, // ignorado de propósito: regra 6 do plano (DEC-63/74)
      },
    });
    expect(updated.startDate).toBe("2026-02-01");
    expect(updated.endDate).toBe("2026-10-13");
    expect(updated.editalNumber).toBe("EDITAL 12/2026");
    expect(updated.processNumber).toBe("IFNMG-2026/0042");
    expect(updated.proppiNumber).toBe("2026.01.001");
    expect(updated.points).toBe(0);

    const row = await prisma.projects.findUnique({ where: { id: projectId } });
    expect(row?.startDate).toBe("2026-02-01");
    expect(row?.endDate).toBe("2026-10-13"); // gravado como dia civil, não como o ISO que entrou
    expect(row?.proppiNumber).toBe("2026.01.001");
    expect(row?.points).toBe(0);

    await expect(
      projectModule.updateProject({ projectId, actorId: coordId, data: { startDate: "2026-02-29" } }),
    ).rejects.toThrow("Dados inválidos: Data de início do projeto inválida");

    await expect(
      projectModule.updateProject({
        projectId,
        actorId: coordId,
        data: { startDate: "2026-12-20", endDate: "2026-02-01" },
      }),
    ).rejects.toThrow("Data de término do projeto não pode ser anterior à data de início");

    // Limpar um campo não toca nos demais (o record do update vem do findById).
    const cleared = await projectModule.updateProject({
      projectId,
      actorId: coordId,
      data: { startDate: "", editalNumber: "" },
    });
    expect(cleared.startDate).toBeNull();
    expect(cleared.editalNumber).toBeNull();
    expect(cleared.endDate).toBe("2026-10-13");
    expect(cleared.processNumber).toBe("IFNMG-2026/0042");
  });

  it("listProjectsForActor (V5-2a, DEC-127): a lista não depende do ator — VOLUNTARIO vê o mesmo que COLABORADOR", async () => {
    const forBeto = await projectModule.listProjectsForActor({ actorId: betoId, actorRoles: ["COLABORADOR"] });
    expect(forBeto.map((p) => p.id)).toContain(projectId);

    const forAna = await projectModule.listProjectsForActor({ actorId: anaId, actorRoles: ["VOLUNTARIO"] });
    // A regra antiga era membro ∪ criado ∪ liderado para quem não tinha MANAGE_TASKS. Hoje os dois
    // atores recebem a MESMA lista, e a comparação é entre as duas chamadas no mesmo instante.
    expect(forAna.map((p) => p.id)).toEqual(forBeto.map((p) => p.id));
    expect(forAna.map((p) => p.id)).toContain(projectId);

    const detail = forAna.find((p) => p.id === projectId)!;
    expect(detail.memberCount).toBe(4); // adapter joins _count.members
    expect(detail.members?.map((m) => m.userId).sort()).toEqual([anaId, betoId, coordId, leaderId].sort());
  });

  it("getProjectForActor (V5-2a, DEC-127): quem não tem relação nenhuma com o projeto lê o detalhe", async () => {
    const viaLeader = await projectModule.getProjectForActor({ projectId, actorId: leaderId, actorRoles: [] });
    expect(viaLeader.id).toBe(projectId);

    // Congelado antes: outsider levava ForbiddenError "Acesso negado ao projeto". A DEC-127 abriu a
    // leitura; o 404 de projeto inexistente continua.
    const viaOutsider = await projectModule.getProjectForActor({
      projectId,
      actorId: outsiderId,
      actorRoles: ["VOLUNTARIO"],
    });
    expect(viaOutsider.id).toBe(projectId);

    await expect(
      projectModule.getProjectForActor({ projectId: 999999, actorId: outsiderId, actorRoles: ["VOLUNTARIO"] }),
    ).rejects.toThrow("Projeto não encontrado");
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

    // V5-2a (DEC-127): o gate de visão era "global OU membership" e o outsider — que ainda NÃO é
    // membro neste ponto do arquivo — levava 403 no painel de Membros do detalhe que acabou de
    // abrir. Hoje membros são leitura do projeto: ele recebe os mesmos quatro.
    const asOutsider = await membershipModule.listProjectMembers({
      projectId,
      actorUserId: outsiderId,
      actorRoles: ["VOLUNTARIO"],
    });
    expect(asOutsider.map((m) => m.userId).sort()).toEqual([anaId, betoId, coordId, leaderId].sort());
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

    // V5-2a (DEC-127): o gate era MANAGE_PROJECTS OU canActorManageProject — o outsider, mesmo
    // depois de virar VOLUNTARIO do projeto, levava 403 no card de horas do detalhe. Hoje o card é
    // leitura do projeto, e ele recebe a MESMA agregação que a gestão recebe.
    const asOutsider = await projectModule.getProjectVolunteers({
      projectId,
      actorId: outsiderId,
      actorRoles: ["VOLUNTARIO"],
    });
    expect(asOutsider.volunteers.map((v) => v.id)).toEqual(result.volunteers.map((v) => v.id));
    expect(asOutsider.stats).toEqual(result.stats);
  });

  it("entregáveis e anexos (V5-2c): CRUD com os gates de escrita, leitura aberta pela DEC-127", async () => {
    const created = await projectModule.createProjectDeliverable({
      projectId,
      actorId: coordId,
      name: "  Relatório parcial  ",
      quantity: "2", // o formulário manda string; o domínio aparar e converte
    });
    expect(created.name).toBe("Relatório parcial");
    expect(created.quantity).toBe(2);
    const deliverableRow = await prisma.project_deliverables.findUnique({ where: { id: created.id } });
    expect(deliverableRow?.projectId).toBe(projectId);

    const defaulted = await projectModule.createProjectDeliverable({
      projectId,
      actorId: coordId,
      name: "Slides",
    });
    expect(defaulted.quantity).toBe(1); // "não informei" é 1, não 0 e não erro

    const updated = await projectModule.updateProjectDeliverable({
      projectId,
      deliverableId: created.id,
      actorId: coordId,
      quantity: 5, // corpo parcial: o nome não mencionado fica
    });
    expect(updated.name).toBe("Relatório parcial");
    expect(updated.quantity).toBe(5);

    // leitura: qualquer autenticado vê (DEC-127). A escrita continua na ACL de gestão.
    const list = await projectModule.listProjectDeliverables({
      projectId,
      actorId: outsiderId,
      actorRoles: ["VOLUNTARIO"],
    });
    expect(list.map((d) => d.id)).toEqual([created.id, defaulted.id]);

    // leitura (V5-2a, DEC-127): entregável é parte do projeto e a leitura é do autenticado — quem
    // nem é do projeto mais (beto teve a membership removida no batch acima) lê a mesma lista.
    const asRemovedMember = await projectModule.listProjectDeliverables({
      projectId,
      actorId: betoId,
      actorRoles: ["COLABORADOR"],
    });
    expect(asRemovedMember.map((d) => d.id)).toEqual(list.map((d) => d.id));

    await expect(
      projectModule.createProjectDeliverable({ projectId, actorId: outsiderId, name: "X" }),
    ).rejects.toThrow("Usuário não tem permissão para gerenciar este projeto");

    await expect(
      projectModule.createProjectDeliverable({
        projectId,
        actorId: coordId,
        name: "X",
        quantity: "muitas",
      }),
    ).rejects.toThrow("Dados inválidos: Quantidade do entregável deve ser um inteiro maior que zero");

    await expect(
      projectModule.updateProjectDeliverable({
        projectId,
        deliverableId: created.id,
        actorId: coordId,
        quantity: 0,
      }),
    ).rejects.toThrow("Quantidade do entregável deve ser um inteiro maior que zero");

    await projectModule.deleteProjectDeliverable({
      projectId,
      deliverableId: defaulted.id,
      actorId: coordId,
    });
    expect(await prisma.project_deliverables.findUnique({ where: { id: defaulted.id } })).toBeNull();

    // Anexo: o módulo escreve só o metadado. A chave é a do bucket, e este roundtrip roda
    // sem bucket nenhum no ar — é exatamente a separação que o batch decidiu (DEC-101).
    const blobKey = `projects/${projectId}/attachments/roundtrip.pdf`;
    const attachment = await projectModule.addProjectAttachment({
      projectId,
      actorId: coordId,
      blobKey,
      name: "roundtrip.pdf",
      contentType: "application/pdf",
      size: 1234,
    });
    expect(attachment.uploadedBy).toBe(coordId);
    expect(attachment.blobKey).toBe(blobKey);
    const attachmentRow = await prisma.project_attachments.findUnique({ where: { id: attachment.id } });
    expect(attachmentRow?.blobKey).toBe(blobKey);
    expect(attachmentRow?.size).toBe(1234);

    const attachments = await projectModule.listProjectAttachments({
      projectId,
      actorId: leaderId, // líder sem membership: acessa, não gerencia
      actorRoles: [],
    });
    expect(attachments.map((a) => a.id)).toEqual([attachment.id]);

    await expect(
      projectModule.addProjectAttachment({
        projectId,
        actorId: outsiderId,
        blobKey: "qualquer/coisa",
        name: "x.pdf",
        contentType: "application/pdf",
        size: 1,
      }),
    ).rejects.toThrow("Usuário não tem permissão para gerenciar este projeto");

    await expect(
      projectModule.addProjectAttachment({
        projectId,
        actorId: coordId,
        blobKey: "qualquer/coisa",
        name: "   ",
        contentType: "application/pdf",
        size: 10,
      }),
    ).rejects.toThrow("Dados inválidos: Nome do anexo é obrigatório");

    // remove devolve o registro: é a rota que apaga o objeto, e precisa da chave para isso
    const removedAttachment = await projectModule.removeProjectAttachment({
      projectId,
      attachmentId: attachment.id,
      actorId: coordId,
    });
    expect(removedAttachment.blobKey).toBe(blobKey);
    expect(await prisma.project_attachments.findUnique({ where: { id: attachment.id } })).toBeNull();
  });

  it("imagem do projeto (V5-2d): chave no banco sem bucket no ar, gate de gestão e chave anterior", async () => {
    const logoKey = `projects/${projectId}/images/logo/primeiro.png`;
    const first = await projectModule.updateProjectImage({
      projectId,
      actorId: coordId,
      slot: "logo",
      blobKey: logoKey,
    });
    expect(first.previousKey).toBeNull();
    expect(first.project.logoKey).toBe(logoKey);
    // O banco guarda a CHAVE. Nenhum byte de bucket existe neste roundtrip: o módulo não conhece
    // bucket (DEC-133), e é por isso que o G4 roda sem serviço de objetos no ar.
    expect((await prisma.projects.findUnique({ where: { id: projectId } }))?.logoKey).toBe(logoKey);

    // Trocar: a chave anterior volta no resultado, porque quem apaga o objeto velho é a rota.
    const nextKey = `projects/${projectId}/images/logo/segundo.png`;
    const second = await projectModule.updateProjectImage({
      projectId,
      actorId: coordId,
      slot: "logo",
      blobKey: nextKey,
    });
    expect(second.previousKey).toBe(logoKey);
    expect(second.project.logoKey).toBe(nextKey);

    // `updateProject` não pode apagar a imagem de raspão: o record vem do findById e a adapter
    // escreve o que já estava.
    await projectModule.updateProject({ projectId, actorId: coordId, data: { name: "Projeto renomeado" } });
    expect((await prisma.projects.findUnique({ where: { id: projectId } }))?.logoKey).toBe(nextKey);

    await expect(
      projectModule.updateProjectImage({
        projectId,
        actorId: outsiderId, // membro sem papel de gestão
        slot: "banner",
        blobKey: "qualquer/coisa",
      }),
    ).rejects.toThrow("Usuário não tem permissão para gerenciar este projeto");

    // Leitura: membro vê a chave; slot vazio responde 404 em vez de servir objeto vazio.
    const image = await projectModule.getProjectImage({
      projectId,
      actorId: outsiderId,
      actorRoles: ["VOLUNTARIO"],
      slot: "logo",
    });
    expect(image.blobKey).toBe(nextKey);
    await expect(
      projectModule.getProjectImage({
        projectId,
        actorId: outsiderId,
        actorRoles: ["VOLUNTARIO"],
        slot: "banner",
      }),
    ).rejects.toThrow("Imagem não encontrada");

    const cleared = await projectModule.updateProjectImage({
      projectId,
      actorId: coordId,
      slot: "logo",
      blobKey: null, // "tira a imagem": o registro é limpo aqui, o objeto é decisão da rota
    });
    expect(cleared.previousKey).toBe(nextKey);
    expect((await prisma.projects.findUnique({ where: { id: projectId } }))?.logoKey).toBeNull();
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
