// @vitest-environment node
/**
 * V5-7a (DEC-76/99/134/157/162) — G4 roundtrip do fluxo de conclusão de atividade contra o
 * banco de teste ISOLADO (127.0.0.1:5433 — nunca a 5432).
 *
 * Exercita a wiring nova com Prisma real, sem mocks e sem bucket: o módulo mexe só no metadado
 * da prova (DEC-133), então a suíte G4 roda com a chave sintética no registro.
 *
 * O que este arquivo mede:
 *   1. solicitar conclusão persiste status + quem pediu + quando; a segunda solicitação é 409;
 *   2. a trava DEC-99 no banco de verdade: tarefa aberta ligada à etapa bloqueia, e a mesma
 *      etapa passa quando a tarefa conclui;
 *   3. apagar a linha do cronograma apaga as provas (Cascade — a prova existe para a etapa);
 *   4. `requestedBy` é SetNull (DEC-155): apagar quem pediu não apaga a atividade, e a coluna
 *      fica nula;
 *   5. `uploadedBy` é a 18ª FK bloqueante (DEC-134): quem subiu prova com dependência zero
 *      continua bloqueado de ser excluído — prova é dado do projeto.
 *
 * Só as linhas criadas por este arquivo saem no afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createProjectManagementModule } from "@/backend/modules/project-management";
import { createUserManagementModule } from "@/backend/modules/user-management";
import { ConflictError, ValidationError, userActor } from "@/backend/domain";

const projectModule = createProjectManagementModule();
const userModule = createUserManagementModule();

const stamp = Date.now();
const NOW = new Date("2026-10-14T12:00:00.000Z");

let donoId = 0; // líder sem membership
let uploaderId = 0; // GERENTE_PROJETO (membership) — sobe a prova
let requesterId = 0; // GERENTE_PROJETO (membership) — pede a conclusão
let adminId = 0; // COORDENADOR — autoridade para o deleteUser
let projectId = 0;
let activityA = 0; // etapa com prova, sem tarefa aberta
let activityB = 0; // etapa bloqueada pela trava DEC-99
const createdTaskIds: number[] = [];

describe("G4 roundtrip — conclusão de atividade (isolated test DB)", () => {
  beforeAll(async () => {
    const dono = await prisma.users.create({
      data: {
        name: `G4 Dono ${stamp}`,
        email: `g4-act-dono-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });
    const uploader = await prisma.users.create({
      data: {
        name: `G4 Uploader ${stamp}`,
        email: `g4-act-uploader-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });
    const requester = await prisma.users.create({
      data: {
        name: `G4 Requester ${stamp}`,
        email: `g4-act-requester-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });
    const admin = await prisma.users.create({
      data: {
        name: `G4 Admin ${stamp}`,
        email: `g4-act-admin-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["COORDENADOR"],
      },
      select: { id: true },
    });
    const project = await prisma.projects.create({
      data: {
        name: `G4 Atividade ${stamp}`,
        createdBy: dono.id,
        leaderId: dono.id,
        status: "active",
        createdAt: new Date().toISOString(),
      },
      select: { id: true },
    });
    await prisma.project_members.create({
      data: { projectId: project.id, userId: uploader.id, roles: ["GERENTE_PROJETO"] },
    });
    await prisma.project_members.create({
      data: { projectId: project.id, userId: requester.id, roles: ["GERENTE_PROJETO"] },
    });

    donoId = dono.id;
    uploaderId = uploader.id;
    requesterId = requester.id;
    adminId = admin.id;
    projectId = project.id;
  });

  afterAll(async () => {
    if (createdTaskIds.length > 0) {
      await prisma.tasks.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    await prisma.project_activities.deleteMany({ where: { projectId } });
    await prisma.project_members.deleteMany({ where: { projectId } });
    await prisma.projects.deleteMany({ where: { id: projectId } });
    await prisma.users.deleteMany({ where: { id: { in: [donoId, uploaderId, requesterId, adminId] } } });
  });

  it("nascimento: duas etapas do cronograma, criadas pelo módulo", async () => {
    const a = await projectModule.createProjectActivity({
      projectId,
      actorId: uploaderId,
      description: "Coleta de dados",
      firstMonth: "2026-04",
      lastMonth: "2026-06",
    });
    const b = await projectModule.createProjectActivity({
      projectId,
      actorId: uploaderId,
      description: "Análise",
      firstMonth: "2026-07",
      lastMonth: "2026-09",
    });
    activityA = a.id;
    activityB = b.id;
    expect(activityA).toBeGreaterThan(0);
  });

  it("prova entra como metadado (sem bucket no ar, DEC-133)", async () => {
    const proof = await projectModule.addActivityFile({
      projectId,
      activityId: activityA,
      actorId: uploaderId,
      blobKey: `projects/${projectId}/activities/${activityA}/files/g4-${stamp}.pdf`,
      name: "parcial.pdf",
      contentType: "application/pdf",
      size: 2048,
    });
    expect(proof.uploadedBy).toBe(uploaderId);

    const row = await prisma.project_activity_files.findUnique({ where: { id: proof.id } });
    expect(row?.activityId).toBe(activityA);
  });

  it("solicitar conclusão persiste status, quem pediu e quando; a segunda é 409", async () => {
    const activity = await projectModule.requestActivityCompletion({
      projectId,
      activityId: activityA,
      actorId: requesterId,
      now: NOW,
    });
    expect(activity.status).toBe("COMPLETION_REQUESTED");
    expect(activity.requestedBy).toBe(requesterId);
    expect(activity.requestedAt).toBe(NOW.toISOString());

    await expect(
      projectModule.requestActivityCompletion({
        projectId,
        activityId: activityA,
        actorId: requesterId,
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("trava DEC-99 medida no banco: tarefa aberta bloqueia; concluída, a mesma etapa passa", async () => {
    const task = await prisma.tasks.create({
      data: {
        title: `G4 tarefa da etapa ${stamp}`,
        status: "in-progress",
        priority: "medium",
        points: 10,
        completed: false,
        projectId,
        activityId: activityB,
      },
      select: { id: true },
    });
    createdTaskIds.push(task.id);

    // prova primeiro (a trava vem antes da prova na ordem, mas a etapa B precisa de prova para
    // passar quando a trava sair — sobe agora).
    await projectModule.addActivityFile({
      projectId,
      activityId: activityB,
      actorId: uploaderId,
      blobKey: `projects/${projectId}/activities/${activityB}/files/g4-b-${stamp}.pdf`,
      name: "analise.pdf",
      contentType: "application/pdf",
      size: 1024,
    });

    const blocked = await projectModule
      .requestActivityCompletion({ projectId, activityId: activityB, actorId: requesterId, now: NOW })
      .catch((error) => error);
    expect(blocked).toBeInstanceOf(ValidationError);
    expect((blocked as ValidationError).message).toBe(
      "Conclua a tarefa restante da atividade antes de solicitar a conclusão",
    );

    await prisma.tasks.update({ where: { id: task.id }, data: { completed: true, status: "done" } });
    const ok = await projectModule.requestActivityCompletion({
      projectId,
      activityId: activityB,
      actorId: requesterId,
      now: NOW,
    });
    expect(ok.status).toBe("COMPLETION_REQUESTED");
  });

  it("apagar a linha do cronograma apaga as provas (Cascade medido)", async () => {
    await projectModule.deleteProjectActivity({
      projectId,
      activityId: activityB,
      actorId: uploaderId,
    });
    const remaining = await prisma.project_activity_files.count({ where: { activityId: activityB } });
    expect(remaining).toBe(0);
    // A tarefa sobrevive sem vínculo — o SET NULL medido no V5-6.
    const task = await prisma.tasks.findUnique({ where: { id: createdTaskIds[0] } });
    expect(task?.activityId).toBeNull();
  });

  it("requestedBy é SetNull (DEC-155): apagar quem pediu mantém a atividade, coluna nula", async () => {
    await prisma.project_members.deleteMany({ where: { userId: requesterId } });
    await prisma.users.delete({ where: { id: requesterId } });

    const activity = await prisma.project_activities.findUnique({ where: { id: activityA } });
    expect(activity?.status).toBe("COMPLETION_REQUESTED");
    expect(activity?.requestedBy).toBeNull();
  });

  it("uploadedBy é a 18ª FK bloqueante (DEC-134): quem subiu prova não é excluído", async () => {
    await expect(
      userModule.deleteUser(userActor(adminId, ["COORDENADOR"]), uploaderId),
    ).rejects.toBeInstanceOf(ConflictError);

    const stillThere = await prisma.users.findUnique({ where: { id: uploaderId } });
    expect(stillThere).not.toBeNull();
  });
});
