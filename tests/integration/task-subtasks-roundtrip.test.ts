// @vitest-environment node
/**
 * S09 (plan-v11, R9) — G4 roundtrip da reordenação de subtasks contra o banco de teste
 * isolado em 5433 (DEC-10; nunca 5432). O que se prova é o caminho completo: use case sobre
 * o adaptador Prisma real grava `sortOrder`, e a leitura (porta) obedece a ordem gravada.
 *
 * Só as linhas criadas por este arquivo saem no afterAll (task cascadeia subtasks).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createTaskManagementModule } from "@/backend/modules/task-management";
import { createNotificationsModule } from "@/backend/modules/notifications";
import { ConflictError, ForbiddenError, userActor } from "@/backend/domain";

const taskModule = createTaskManagementModule({ notifications: createNotificationsModule() });
const stamp = Date.now();
let anaId = 0;
let leaderId = 0;
let estranhoId = 0;
let projectId = 0;
let taskId = 0;

const anaActor = () => userActor(anaId, ["VOLUNTARIO"]);
const leaderActor = () => userActor(leaderId, ["GERENTE_PROJETO"]);
const estranhoActor = () => userActor(estranhoId, ["VOLUNTARIO"]);

describe("G4 roundtrip — reordenação de subtasks (isolated test DB)", () => {
  beforeAll(async () => {
    const ana = await prisma.users.create({
      data: { name: `G4 S09 Ana ${stamp}`, email: `g4-s09-ana-${stamp}@test.local`, password: "g4-dummy-hash", status: "active", roles: ["VOLUNTARIO"] },
      select: { id: true },
    });
    const leader = await prisma.users.create({
      data: { name: `G4 S09 Leader ${stamp}`, email: `g4-s09-leader-${stamp}@test.local`, password: "g4-dummy-hash", status: "active", roles: ["GERENTE_PROJETO"] },
      select: { id: true },
    });
    const estranho = await prisma.users.create({
      data: { name: `G4 S09 Estranho ${stamp}`, email: `g4-s09-estranho-${stamp}@test.local`, password: "g4-dummy-hash", status: "active", roles: ["VOLUNTARIO"] },
      select: { id: true },
    });
    const project = await prisma.projects.create({
      data: { name: `G4 S09 Project ${stamp}`, createdBy: leader.id, leaderId: leader.id, status: "active", createdAt: new Date().toISOString() },
      select: { id: true },
    });
    await prisma.project_members.create({ data: { projectId: project.id, userId: ana.id } });

    anaId = ana.id;
    leaderId = leader.id;
    estranhoId = estranho.id;
    projectId = project.id;

    const task = await taskModule.createTask(
      {
        title: `G4 S09 mãe ${stamp}`,
        description: "roundtrip",
        completed: false,
        status: "in-progress",
        priority: "medium",
        assigneeIds: [anaId],
        projectId,
        points: 25,
        taskVisibility: "delegated",
      },
      leaderActor(),
    );
    taskId = task.id!;

    await taskModule.createTaskSubtask({ taskId, actorId: anaId, title: "Ligar a fonte" });
    await taskModule.createTaskSubtask({ taskId, actorId: anaId, title: "Ajustar o zero" });
    await taskModule.createTaskSubtask({ taskId, actorId: anaId, title: "Medir o ruído" });
  });

  afterAll(async () => {
    await prisma.tasks.delete({ where: { id: taskId } });
    await prisma.projects.delete({ where: { id: projectId } });
    await prisma.users.deleteMany({ where: { id: { in: [anaId, leaderId, estranhoId] } } });
  });

  it("a ordem inicial é a ordem de criação, com sortOrder igual à posição", async () => {
    const rows = await prisma.task_subtasks.findMany({ where: { taskId }, orderBy: { id: "asc" } });
    expect(rows.map((r) => r.title)).toEqual(["Ligar a fonte", "Ajustar o zero", "Medir o ruído"]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
  });

  it("o dono reordena e as linhas ficam na ordem nova", async () => {
    const rows = await prisma.task_subtasks.findMany({ where: { taskId }, orderBy: { id: "asc" } });
    const ids = rows.map((r) => r.id);
    const result = await taskModule.reorderTaskSubtasks({
      taskId,
      actorId: anaId,
      orderedIds: [ids[1], ids[0], ids[2]],
    });
    expect(result.subtasks.map((s) => s.title)).toEqual(["Ajustar o zero", "Ligar a fonte", "Medir o ruído"]);

    const persisted = await prisma.task_subtasks.findMany({ where: { taskId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    expect(persisted.map((r) => r.title)).toEqual(["Ajustar o zero", "Ligar a fonte", "Medir o ruído"]);
    expect(persisted.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
  });

  it("a leitura da mãe obedece a ordem gravada", async () => {
    const view = await taskModule.getTaskById({ actor: anaActor(), taskId });
    expect(view?.subtasks?.map((s: { title: string }) => s.title)).toEqual(["Ajustar o zero", "Ligar a fonte", "Medir o ruído"]);
  });

  it("estranho sem autoridade: Forbidden, e nada muda no banco", async () => {
    const rows = await prisma.task_subtasks.findMany({ where: { taskId }, orderBy: { id: "asc" } });
    const ids = rows.map((r) => r.id);
    const before = await prisma.task_subtasks.findMany({ where: { taskId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    await expect(
      taskModule.reorderTaskSubtasks({ taskId, actorId: estranhoId, orderedIds: [ids[1], ids[2], ids[0]] })
    ).rejects.toThrow(ForbiddenError);
    const after = await prisma.task_subtasks.findMany({ where: { taskId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    expect(after.map((r) => r.title)).toEqual(before.map((r) => r.title));
  });

  it("mãe em done: janela da lista responde com 409 e a ordem não muda", async () => {
    await prisma.tasks.update({ where: { id: taskId }, data: { status: "done" } });
    const rows = await prisma.task_subtasks.findMany({ where: { taskId }, orderBy: { id: "asc" } });
    const ids = rows.map((r) => r.id);
    await expect(
      taskModule.reorderTaskSubtasks({ taskId, actorId: leaderId, orderedIds: [ids[1], ids[0], ids[2]] })
    ).rejects.toThrow(ConflictError);
    const after = await prisma.task_subtasks.findMany({ where: { taskId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    expect(after.map((r) => r.title)).toEqual(["Ajustar o zero", "Ligar a fonte", "Medir o ruído"]);
  });

  it("ids que não são a lista exata: 400, e a ordem não muda", async () => {
    await prisma.tasks.update({ where: { id: taskId }, data: { status: "in-progress" } });
    const rows = await prisma.task_subtasks.findMany({ where: { taskId }, orderBy: { id: "asc" } });
    const ids = rows.map((r) => r.id);
    await expect(
      taskModule.reorderTaskSubtasks({ taskId, actorId: anaId, orderedIds: [ids[0], ids[1]] })
    ).rejects.toThrow(/ordem/);
    await expect(
      taskModule.reorderTaskSubtasks({ taskId, actorId: anaId, orderedIds: [ids[0], ids[0], ids[2]] })
    ).rejects.toThrow(/ordem/);
    const after = await prisma.task_subtasks.findMany({ where: { taskId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    expect(after.map((r) => r.title)).toEqual(["Ajustar o zero", "Ligar a fonte", "Medir o ruído"]);
  });
});
