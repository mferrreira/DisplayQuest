// @vitest-environment node
/**
 * OND4-B4 — G4 roundtrip smoke of the task-management module against the ISOLATED test DB
 * (127.0.0.1:5433 — DEC-10/BLOCKER-02; never 5432).
 *
 * Exercises the NEW wiring end-to-end with real Prisma (no mocks):
 *   createTask -> getTaskById -> D-41 claim (updateTask in-progress) -> completeTask
 *   (delegated -> in-review + TASK_REVIEW_REQUEST notification) -> approveTask (leader) ->
 *   rejectTask (FIX line) -> public completion (task_user_progress, row untouched) ->
 *   global quest + globalProgress roster -> listTasksForActor -> deleteTask (cascade),
 *   using `createTaskManagementModule()` exactly as the composition root builds it (use
 *   cases over the thin Prisma adapters). No awards publisher is wired here on purpose:
 *   the gamification side effects are exercised by the gamification wave.
 *
 * Only rows created by this file are removed in afterAll (tasks -> task_assignees /
 * task_user_progress onDelete: Cascade; users -> notifications Cascade).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createTaskManagementModule } from "@/backend/modules/task-management";
import { createNotificationsModule } from "@/backend/modules/notifications";
import { civilDayOfInstant } from "@/backend/domain";

// B7 (D7): o fallback cruzado da factory virou no-op; o roundtrip ASSERTA notificacoes
// reais no banco, entao injeta o modulo de notifications explicitamente (a composition
// root faz o mesmo).
const taskModule = createTaskManagementModule({ notifications: createNotificationsModule() });
const stamp = Date.now();
let anaId = 0;
let leaderId = 0;
let coordinatorId = 0;
let projectId = 0;
const createdTaskIds: number[] = [];

describe("G4 roundtrip — task-management (isolated test DB)", () => {
  beforeAll(async () => {
    const ana = await prisma.users.create({
      data: {
        name: `G4 Ana ${stamp}`,
        email: `g4-tasks-ana-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });
    const leader = await prisma.users.create({
      data: {
        name: `G4 Leader ${stamp}`,
        email: `g4-tasks-leader-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["GERENTE_PROJETO"],
      },
      select: { id: true },
    });
    const project = await prisma.projects.create({
      data: { name: `G4 Project ${stamp}`, createdBy: leader.id, leaderId: leader.id, status: "active", createdAt: new Date().toISOString() },
      select: { id: true },
    });
    await prisma.project_members.create({ data: { projectId: project.id, userId: ana.id } });

    anaId = ana.id;
    leaderId = leader.id;
    projectId = project.id;
  });

  it("bootstrap: a COORDENADOR exists for the global-quest gate (MANAGE_USERS)", async () => {
    const coordinator = await prisma.users.create({
      data: {
        name: `G4 Coord ${stamp}`,
        email: `g4-tasks-coord-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["COORDENADOR"],
      },
      select: { id: true },
    });
    coordinatorId = coordinator.id;
    expect(coordinatorId).toBeGreaterThan(0);
  });

  afterAll(async () => {
    if (createdTaskIds.length > 0) {
      // tasks -> task_assignees / task_user_progress / work_session_tasks onDelete: Cascade
      await prisma.tasks.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    if (projectId) await prisma.projects.delete({ where: { id: projectId } });
    if (anaId) await prisma.users.delete({ where: { id: anaId } }); // notifications cascade
    if (leaderId) await prisma.users.delete({ where: { id: leaderId } });
    if (coordinatorId) await prisma.users.delete({ where: { id: coordinatorId } });
  });

  it("createTask persists the row + task_assignees and forces createdBy = actor", async () => {
    const task = await taskModule.createTask(
      {
        title: "G4 delegated task",
        description: "roundtrip",
        completed: false,
        status: "to-do",
        priority: "medium",
        assigneeIds: [anaId],
        projectId,
        points: 7,
        taskVisibility: "delegated",
      },
      leaderId,
    );
    createdTaskIds.push(task.id!);

    const row = await prisma.tasks.findUnique({ where: { id: task.id! } });
    expect(row).not.toBeNull();
    expect(row?.assignedTo).toBe(anaId);
    expect(row?.createdBy).toBe(leaderId);

    const assignees = await prisma.task_assignees.findMany({ where: { taskId: task.id! } });
    expect(assignees.map((a) => a.userId)).toEqual([anaId]);
    expect(assignees[0].assignedBy).toBe(leaderId);

    const view = await taskModule.getTaskById(task.id!);
    expect(view?.assigneeIds).toEqual([anaId]);
    expect(view?.assignedTo).toBe(anaId);
  });

  it("D-41 claim: pulling an unclaimed project task to in-progress makes the volunteer the owner", async () => {
    const task = await taskModule.createTask(
      { title: "G4 unclaimed task", completed: false, status: "to-do", priority: "medium", points: 5, taskVisibility: "delegated", projectId },
      leaderId,
    );
    createdTaskIds.push(task.id!);

    const updated = await taskModule.updateTask({ taskId: task.id!, actorId: anaId, data: { status: "in-progress" } });
    expect(updated.assignedTo).toBe(anaId);
    expect(updated.assigneeIds).toEqual([anaId]);

    const row = await prisma.tasks.findUnique({ where: { id: task.id! } });
    expect(row?.assignedTo).toBe(anaId);
    expect(row?.status).toBe("in-progress");

    const assignees = await prisma.task_assignees.findMany({ where: { taskId: task.id! } });
    expect(assignees.map((a) => [a.userId, a.assignedBy])).toEqual([[anaId, anaId]]);
  });

  it("updateTask into in-review notifies the leader; approveTask closes it and counts the completion", async () => {
    const task = await taskModule.createTask(
      { title: "G4 review flow", completed: false, status: "in-progress", priority: "medium", points: 5, taskVisibility: "delegated", projectId, assignedTo: anaId },
      leaderId,
    );
    createdTaskIds.push(task.id!);

    // Status-only transition by the assigned volunteer -> TASK_REVIEW_REQUEST to the leader.
    const review = await taskModule.updateTask({ taskId: task.id!, actorId: anaId, data: { status: "in-review" } });
    expect(review.status).toBe("in-review");

    const reviewNotification = await prisma.notifications.findFirst({
      where: { userId: leaderId, type: "TASK_REVIEW_REQUEST" },
    });
    expect(reviewNotification).not.toBeNull();
    expect(reviewNotification?.title).toBe("Tarefa em Revisão");

    const approved = await taskModule.approveTask({ taskId: task.id!, approverId: leaderId });
    expect(approved.status).toBe("done");

    const row = await prisma.tasks.findUnique({ where: { id: task.id! } });
    expect(row?.completedAt).not.toBeNull();

    const ana = await prisma.users.findUnique({ where: { id: anaId } });
    expect(ana?.completedTasks).toBe(1);

    const approvedNotification = await prisma.notifications.findFirst({
      where: { userId: anaId, type: "TASK_APPROVED" },
    });
    expect(approvedNotification).not.toBeNull();
  });

  it("completeTask (delegated) lands in-review with completed=true, completedAt NOT set, no counter", async () => {
    const task = await taskModule.createTask(
      { title: "G4 complete flow", completed: false, status: "in-progress", priority: "medium", points: 6, taskVisibility: "delegated", projectId, assignedTo: anaId },
      leaderId,
    );
    createdTaskIds.push(task.id!);

    const completed = await taskModule.completeTask({ taskId: task.id!, userId: anaId });
    expect(completed.status).toBe("in-review");
    expect(completed.completed).toBe(true);

    const row = await prisma.tasks.findUnique({ where: { id: task.id! } });
    expect(row?.status).toBe("in-review");
    expect(row?.completed).toBe(true);
    expect(row?.completedAt).toBeNull(); // frozen: completedAt only lands via approveTask

    const ana = await prisma.users.findUnique({ where: { id: anaId } });
    expect(ana?.completedTasks).toBe(1); // counter lives in approveTask, not here
  });

  it("rejectTask sends the task back to adjust with the FIX instruction appended", async () => {
    const task = await taskModule.createTask(
      { title: "G4 rejected task", completed: false, description: "Desc original", status: "in-review", priority: "medium", points: 3, taskVisibility: "delegated", projectId, assignedTo: anaId },
      leaderId,
    );
    createdTaskIds.push(task.id!);

    const rejected = await taskModule.rejectTask({ taskId: task.id!, approverId: leaderId, reason: "precisa de testes" });
    expect(rejected.status).toBe("adjust");
    expect(rejected.description).toContain("FIX (");
    expect(rejected.description).toContain("precisa de testes");

    const row = await prisma.tasks.findUnique({ where: { id: task.id! } });
    expect(row?.status).toBe("adjust");
    expect(row?.completed).toBe(false);
    expect(row?.description).toBe(rejected.description);
  });

  it("public completion lives in task_user_progress and leaves the task row untouched", async () => {
    const task = await taskModule.createTask(
      { title: "G4 public quest", completed: false, status: "to-do", priority: "medium", points: 8, taskVisibility: "public" },
      leaderId,
    );
    createdTaskIds.push(task.id!);

    const result = await taskModule.completeTask({ taskId: task.id!, userId: anaId });
    expect(result.status).toBe("done");
    expect(result.assignedTo).toBe(anaId);

    const row = await prisma.tasks.findUnique({ where: { id: task.id! } });
    expect(row?.status).toBe("to-do"); // row NEVER closed by the public branch
    expect(row?.completed).toBe(false);

    const progress = await prisma.task_user_progress.findFirst({ where: { taskId: task.id!, userId: anaId } });
    expect(progress?.status).toBe("done");
    expect(progress?.completedAt).not.toBeNull();
    expect(progress?.awardedPoints).toBe(10); // plan-v3 DEC-30: POINTS_PER_TASK, não o `points: 8` gravado

    const ana = await prisma.users.findUnique({ where: { id: anaId } });
    expect(ana?.completedTasks).toBe(2);

    // Idempotent per user: a second completion is rejected.
    await expect(taskModule.completeTask({ taskId: task.id!, userId: anaId })).rejects.toThrow(
      "Tarefa pública já concluída por este usuário",
    );
  });

  it("AC-P3-01 (plan-v3): prazo HOJE, concluída HOJE -> credita 10 no banco, não 0", async () => {
    // Pré-v3 este caso creditava 0: dueDate date-only virava meia-noite UTC e qualquer hora
    // do dia contava como 1 dia de atraso. Aqui é Prisma real, pela wiring nova.
    const today = civilDayOfInstant(new Date());
    const task = await taskModule.createTask(
      {
        title: `G4 due today ${stamp}`,
        completed: false,
        status: "to-do",
        priority: "medium",
        points: 0, // DEC-40: o valor gravado deixou de importar
        taskVisibility: "public",
        dueDate: today,
      },
      leaderId,
    );
    createdTaskIds.push(task.id!);

    await taskModule.completeTask({ taskId: task.id!, userId: coordinatorId });

    const progress = await prisma.task_user_progress.findFirst({
      where: { taskId: task.id!, userId: coordinatorId },
    });
    expect(progress?.status).toBe("done");
    expect(progress?.awardedPoints).toBe(10);
  });

  it("global quest (MANAGE_USERS creator) + globalProgress roster aggregation", async () => {
    const quest = await taskModule.createTask(
      { title: "G4 global quest", completed: false, status: "to-do", priority: "low", points: 2, isGlobal: true, taskVisibility: "public" },
      coordinatorId,
    );
    createdTaskIds.push(quest.id!);

    const row = await prisma.tasks.findUnique({ where: { id: quest.id! } });
    expect(row?.isGlobal).toBe(true);
    expect(row?.taskVisibility).toBe("public");
    expect(row?.assignedTo).toBeNull();
    expect(row?.projectId).toBeNull();

    const entries = await taskModule.globalProgress();
    const entry = entries.find((e) => e.id === quest.id);
    expect(entry).toBeDefined();
    expect(entry?.pendingUsers.map((u) => u.id)).toContain(anaId);
    expect(entry?.completedCount).toBe(0);
    expect(entry?.audienceSize).toBeGreaterThanOrEqual(2); // ana (VOLUNTARIO) + leader (GERENTE_PROJETO)
  });

  it("listTasksForActor (volunteer): own + project + public/global shared, with progress overlay", async () => {
    const tasks = await taskModule.listTasksForActor({ actorId: anaId, actorRoles: ["VOLUNTARIO"] });
    const ids = tasks.map((t) => t.id);

    expect(ids).toEqual(expect.arrayContaining(createdTaskIds.filter((id) => id !== undefined)));

    // The public quest shows the ACTOR's own progress (done), not the row's (to-do).
    const publicQuest = tasks.find((t) => t.title === "G4 public quest");
    expect(publicQuest?.status).toBe("done");
    expect(publicQuest?.assignedTo).toBe(anaId);
  });

  it("deleteTask removes the row and cascades task_assignees + task_user_progress", async () => {
    const targetId = createdTaskIds[0];
    await taskModule.deleteTask({ taskId: targetId, actorId: leaderId });

    expect(await prisma.tasks.findUnique({ where: { id: targetId } })).toBeNull();
    expect(await prisma.task_assignees.findMany({ where: { taskId: targetId } })).toHaveLength(0);
    expect(await prisma.task_user_progress.findMany({ where: { taskId: targetId } })).toHaveLength(0);
  });
});
