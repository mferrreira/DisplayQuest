// @vitest-environment node
/**
 * S13 (plan-v11, R13) — G4 roundtrip da REVERSÃO de pontos contra o banco de teste isolado
 * em 5433 (DEC-10; nunca 5432). É o caminho da economia inteira, sem mocks: módulo de tarefa
 * REAL com o gamification REAL injetado pela porta local `TaskAwardPort` + `TaskReversalPort`
 * e o adaptador de `projects.points` compartilhado, montado à mão como no composition root.
 *
 * A sequência é a da demo do dono: aprovar (crédito C) → responsável sem gestão tenta mover de
 * Concluído (403, R12) → gestão move → saldo e placar do mês do creditado caem C, `projects.points`
 * cai C (piso 0), linha de reversão `GAMIFICATION:TASK_REVERSED:<taskId>` entra no history;
 * re-aprovar premia de novo (a chave original foi liberada).
 *
 * Limpeza: as linhas `history` de award têm FK RESTRICT para `users` — saem ANTES dos usuários.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createTaskManagementModule } from "@/backend/modules/task-management";
import { createNotificationsModule } from "@/backend/modules/notifications";
import { createGamificationModule } from "@/backend/modules/gamification";
import { createPrismaProjectRepository } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project.repository";
import { createTaskProgressEvents } from "@/backend/modules/task-management/infrastructure/gamification-task-progress.events";
import { ForbiddenError, userActor } from "@/backend/domain";

const stamp = Date.now();
const gamification = createGamificationModule();
const projectsRepository = createPrismaProjectRepository();

const taskModule = createTaskManagementModule({
  notifications: createNotificationsModule(),
  events: createTaskProgressEvents({
    awards: gamification,
    reversals: gamification,
    projectPoints: { incrementProjectPoints: (projectId, delta) => projectsRepository.incrementPoints(projectId, delta) },
  }),
});

let managerId = 0;
let anaId = 0;
let projectId = 0;
let taskId = 0;

const managerActor = () => userActor(managerId, ["COORDENADOR"]);
const anaActor = () => userActor(anaId, ["VOLUNTARIO"]);

function pointsOf(userId: number) {
  return prisma.users.findUnique({ where: { id: userId }, select: { points: true, currentMonthPoints: true } });
}
function projectPoints() {
  return prisma.projects.findUnique({ where: { id: projectId }, select: { points: true } });
}

describe("G4 roundtrip — reversão de pontos na saída de done (isolated test DB)", () => {
  beforeAll(async () => {
    const manager = await prisma.users.create({
      data: { name: `G4 Rev Manager ${stamp}`, email: `g4-rev-manager-${stamp}@test.local`, password: "g4-dummy-hash", status: "active", roles: ["COORDENADOR"] },
      select: { id: true },
    });
    const ana = await prisma.users.create({
      data: { name: `G4 Rev Ana ${stamp}`, email: `g4-rev-ana-${stamp}@test.local`, password: "g4-dummy-hash", status: "active", roles: ["VOLUNTARIO"] },
      select: { id: true },
    });
    const project = await prisma.projects.create({
      data: { name: `G4 Rev Project ${stamp}`, createdBy: manager.id, leaderId: manager.id, status: "active", createdAt: new Date().toISOString() },
      select: { id: true },
    });
    await prisma.project_members.create({ data: { projectId: project.id, userId: ana.id } });

    managerId = manager.id;
    anaId = ana.id;
    projectId = project.id;

    const task = await taskModule.createTask(
      {
        title: `G4 Rev mãe ${stamp}`,
        description: "roundtrip",
        completed: false,
        status: "in-progress",
        priority: "medium",
        assigneeIds: [anaId],
        projectId,
        points: 25,
        taskVisibility: "delegated",
      },
      managerActor(),
    );
    taskId = task.id!;
  });

  afterAll(async () => {
    await prisma.history.deleteMany({ where: { entityId: anaId, action: "GAMIFICATION_AWARD" } });
    await prisma.tasks.delete({ where: { id: taskId } });
    await prisma.projects.delete({ where: { id: projectId } });
    await prisma.users.deleteMany({ where: { id: { in: [anaId, managerId] } } });
  });

  it("aprovação credita o responsável: points, currentMonthPoints e projects.points sobem C", async () => {
    const before = await pointsOf(anaId);
    const projectBefore = await projectPoints();

    await taskModule.updateTask({ taskId, actor: anaActor(), data: { status: "in-review" } });
    const approved = await taskModule.approveTask({ taskId, approverId: managerId });
    expect(approved.task.status).toBe("done");

    const after = await pointsOf(anaId);
    const projectAfter = await projectPoints();
    const C = approved.awardedPoints as number;
    expect(C).toBeGreaterThan(0);

    expect(after!.points - before!.points).toBe(C);
    expect(after!.currentMonthPoints - before!.currentMonthPoints).toBe(C);
    expect(projectAfter!.points - projectBefore!.points).toBe(C);

    const awardRow = await prisma.history.findFirst({
      where: { entityId: anaId, action: "GAMIFICATION_AWARD", description: `GAMIFICATION:TASK_COMPLETED:${taskId}` },
    });
    expect(awardRow).not.toBeNull();
  });

  it("responsável sem gestão não move a tarefa para fora de done (R12), e nada muda", async () => {
    const before = await pointsOf(anaId);

    await expect(
      taskModule.updateTask({ taskId, actor: anaActor(), data: { status: "in-progress" } })
    ).rejects.toThrow(ForbiddenError);

    expect((await prisma.tasks.findUnique({ where: { id: taskId }, select: { status: true } }))?.status).toBe("done");
    const after = await pointsOf(anaId);
    expect(after!.points).toBe(before!.points);
  });

  it("gestão move para in-progress → saldo e mês do creditado caem, projects cai, linha de reversão criada", async () => {
    const before = await pointsOf(anaId);
    const projectBefore = await projectPoints();
    const awardRow = await prisma.history.findFirst({
      where: { entityId: anaId, action: "GAMIFICATION_AWARD", description: `GAMIFICATION:TASK_COMPLETED:${taskId}` },
      select: { newValues: true },
    });
    const C = Number((awardRow!.newValues as { pointsAwarded: number }).pointsAwarded);

    const moved = await taskModule.updateTask({ taskId, actor: managerActor(), data: { status: "in-progress" } });
    expect(moved.status).toBe("in-progress");
    expect(moved.completed).toBe(false);

    const after = await pointsOf(anaId);
    const projectAfter = await projectPoints();

    expect(before!.points - after!.points).toBe(C);
    expect(before!.currentMonthPoints - after!.currentMonthPoints).toBe(C);
    expect(projectBefore!.points - projectAfter!.points).toBe(C);

    // A premiação original é consumida pela reversão.
    const originalGone = await prisma.history.findFirst({
      where: { entityId: anaId, action: "GAMIFICATION_AWARD", description: `GAMIFICATION:TASK_COMPLETED:${taskId}` },
    });
    expect(originalGone).toBeNull();

    const reversalRow = await prisma.history.findFirst({
      where: { entityId: anaId, action: "GAMIFICATION_AWARD", description: `GAMIFICATION:TASK_REVERSED:${taskId}` },
    });
    expect(reversalRow).not.toBeNull();
    expect((reversalRow!.newValues as { pointsReversed: number }).pointsReversed).toBe(C);
  });

  it("movimento de volta para in-review não deducta de novo (I3: uma transição deducta uma vez)", async () => {
    const before = await pointsOf(anaId);
    const projectBefore = await projectPoints();

    await taskModule.updateTask({ taskId, actor: managerActor(), data: { status: "in-review" } });
    const after = await pointsOf(anaId);
    const projectAfter = await projectPoints();

    expect(after!.points).toBe(before!.points);
    expect(projectAfter!.points).toBe(projectBefore!.points);
    const reversalCount = await prisma.history.count({
      where: { entityId: anaId, action: "GAMIFICATION_AWARD", description: `GAMIFICATION:TASK_REVERSED:${taskId}` },
    });
    expect(reversalCount).toBe(1);
  });

  it("re-aprovar volta a premiar (a chave original foi liberada)", async () => {
    const before = await pointsOf(anaId);

    const approved = await taskModule.approveTask({ taskId, approverId: managerId });
    expect(approved.task.status).toBe("done");

    const after = await pointsOf(anaId);
    const secondAward = approved.awardedPoints as number;
    expect(secondAward).toBeGreaterThan(0);
    expect(after!.points - before!.points).toBe(secondAward);

    const reAwardRow = await prisma.history.findFirst({
      where: { entityId: anaId, action: "GAMIFICATION_AWARD", description: `GAMIFICATION:TASK_COMPLETED:${taskId}` },
    });
    expect(reAwardRow).not.toBeNull();
  });
});
