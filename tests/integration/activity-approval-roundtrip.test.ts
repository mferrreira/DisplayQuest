// @vitest-environment node
/**
 * V5-7b (DEC-63/74/76/77/103/104/163/164/165) — G4 roundtrip da APROVAÇÃO de atividade contra
 * o banco de teste ISOLADO (127.0.0.1:5433 — nunca a 5432).
 *
 * É o roundtrip da economia inteira, sem mocks: módulo de projeto REAL com o gamification REAL
 * injetado pela porta local `ActivityCompletionAwardPort` (DEC-21) — o mesmo wiring do
 * composition root, montado à mão aqui.
 *
 * O que este arquivo mede:
 *   1. aprovação persiste DONE + quem aprovou + quando; reexecução é 409 (o guardião do
 *      "uma vez só" é a transição, DEC-165);
 *   2. o prêmio sai do domínio (×1,5 antecipada, DEC-103) e cai nos membros ATIVOS do vínculo
 *      proporcional às tasks concluídas (DEC-104/163) — com `task_assignees` E
 *      `task_user_progress` na mesma conta;
 *   3. membro INATIVO (DEC-149) fica fora da conta mesmo tendo tarefas;
 *   4. o credit de cada membro é uma linha `GAMIFICATION:ACTIVITY_COMPLETED:<atividade>` no
 *      history e incrementa `users.points` de verdade;
 *   5. `projects.points` sobe pelo prêmio com piso 0 (DEC-63/74);
 *   6. GERENTE não auto-aprova (403); COORDENADOR sim (DEC-77).
 *
 * Limpeza: as linhas `history` dos awards têm FK RESTRICT para `users` — saem ANTES dos
 * usuários no afterAll. Só as linhas criadas por este arquivo saem.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { createProjectManagementModule } from "@/backend/modules/project-management";
import { createGamificationModule } from "@/backend/modules/gamification";
import { createGamificationActivityCompletionAward } from "@/backend/modules/project-management/infrastructure/adapters/gamification-activity-completion-award";
import { ConflictError, ForbiddenError } from "@/backend/domain";

const stamp = Date.now();
// Aprovação em 28/06/2026: 2 dias antes do prazo 30/06 → ×1,5 da base 300 = 450 (DEC-103).
const NOW = new Date("2026-06-28T12:00:00.000Z");

const projectModule = createProjectManagementModule({
  ports: {
    activityAwards: createGamificationActivityCompletionAward(createGamificationModule()),
  },
});

let coordinatorId = 0;
let bolsista1Id = 0; // 2 tasks concluídas
let bolsista2Id = 0; // 2 tasks concluídas (uma delas junto com bolsista1)
let inativoId = 0; // membro INATIVO com tarefa — fora da conta
let gerenteId = 0; // GERENTE global que pede e não pode auto-aprovar
let projectId = 0;
let activityA = 0;
let activityB = 0;
const createdTaskIds: number[] = [];
const createdUserIds: number[] = [];

describe("G4 roundtrip — aprovação de atividade e economia do projeto (isolated test DB)", () => {
  beforeAll(async () => {
    const specs: Array<{ name: string; roles: UserRole[] }> = [
      { name: "Coordinator", roles: ["COORDENADOR"] },
      { name: "Bolsista 1", roles: ["VOLUNTARIO"] },
      { name: "Bolsista 2", roles: ["VOLUNTARIO"] },
      { name: "Inativo", roles: ["VOLUNTARIO"] },
      { name: "Gerente", roles: ["GERENTE"] },
    ];
    const users = await Promise.all(
      specs.map((spec) =>
        prisma.users.create({
          data: {
            name: `G4 Apv ${spec.name} ${stamp}`,
            email: `g4-apv-${spec.name.toLowerCase().replace(/\s+/g, "-")}-${stamp}@test.local`,
            password: "g4-dummy-hash",
            status: "active",
            roles: spec.roles,
          },
          select: { id: true },
        }),
      ),
    );
    [coordinatorId, bolsista1Id, bolsista2Id, inativoId, gerenteId] = users.map((user) => user.id);
    createdUserIds.push(...users.map((user) => user.id));

    const project = await prisma.projects.create({
      data: {
        name: `G4 Aprovacao ${stamp}`,
        createdBy: coordinatorId,
        leaderId: coordinatorId,
        status: "active",
        createdAt: new Date().toISOString(),
      },
      select: { id: true },
    });
    projectId = project.id;

    await prisma.project_members.createMany({
      data: [
        { projectId, userId: bolsista1Id, roles: ["COLABORADOR"] },
        { projectId, userId: bolsista2Id, roles: ["COLABORADOR"] },
        { projectId, userId: inativoId, roles: ["VOLUNTARIO"], situacao: "INATIVO" },
        { projectId, userId: gerenteId, roles: ["GERENTE_PROJETO"] },
      ],
    });

    // Etapa A: pedida pelo bolsista1, aprovada pelo coordenador.
    activityA = (
      await prisma.project_activities.create({
        data: {
          projectId,
          order: 1,
          description: "Coleta de dados",
          firstMonth: "2026-04",
          lastMonth: "2026-06",
          status: "COMPLETION_REQUESTED",
          requestedBy: bolsista1Id,
          requestedAt: new Date("2026-06-20T12:00:00.000Z"),
        },
        select: { id: true },
      })
    ).id;

    // Etapa B: pedida pelo GERENTE global — a auto-aprovação dele é 403; a do coordenador, não.
    activityB = (
      await prisma.project_activities.create({
        data: {
          projectId,
          order: 2,
          description: "Relatório parcial",
          firstMonth: "2026-04",
          lastMonth: "2026-06",
          status: "COMPLETION_REQUESTED",
          requestedBy: gerenteId,
          requestedAt: new Date("2026-06-20T12:00:00.000Z"),
        },
        select: { id: true },
      })
    ).id;

    // Atribuição DEC-163 medida no banco: assignees e completadores públicos na mesma conta.
    const task1 = await prisma.tasks.create({
      data: {
        title: `G4 Apv task1 ${stamp}`,
        status: "done",
        priority: "medium",
        points: 10,
        completed: true,
        projectId,
        assignedTo: bolsista1Id,
      },
      select: { id: true },
    });
    await prisma.task_assignees.create({ data: { taskId: task1.id, userId: bolsista1Id } });

    const task2 = await prisma.tasks.create({
      data: {
        title: `G4 Apv task2 ${stamp}`,
        status: "done",
        priority: "medium",
        points: 10,
        completed: true,
        projectId,
      },
      select: { id: true },
    });
    await prisma.task_assignees.createMany({
      data: [
        { taskId: task2.id, userId: bolsista1Id },
        { taskId: task2.id, userId: bolsista2Id },
      ],
    });

    const task3 = await prisma.tasks.create({
      data: {
        title: `G4 Apv task3 ${stamp}`,
        status: "done",
        priority: "medium",
        points: 10,
        completed: true,
        projectId,
        taskVisibility: "public",
      },
      select: { id: true },
    });
    await prisma.task_user_progress.create({
      data: { taskId: task3.id, userId: bolsista2Id, status: "done", completedAt: new Date() },
    });

    // Tarefa do membro INATIVO — existe, e ainda assim ele não entra na conta (DEC-149/104).
    const taskInactive = await prisma.tasks.create({
      data: {
        title: `G4 Apv task-inativo ${stamp}`,
        status: "done",
        priority: "medium",
        points: 10,
        completed: true,
        projectId,
      },
      select: { id: true },
    });
    await prisma.task_assignees.create({ data: { taskId: taskInactive.id, userId: inativoId } });

    createdTaskIds.push(task1.id, task2.id, task3.id, taskInactive.id);
  });

  afterAll(async () => {
    // history.performedBy é RESTRICT para users: os awards saem primeiro.
    await prisma.history.deleteMany({ where: { performedBy: { in: createdUserIds } } });
    if (createdTaskIds.length > 0) {
      await prisma.tasks.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    await prisma.project_activities.deleteMany({ where: { projectId } });
    await prisma.project_members.deleteMany({ where: { projectId } });
    await prisma.projects.deleteMany({ where: { id: projectId } });
    await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("GERENTE não auto-aprova o que pediu (403); COORDENADOR aprova a mesma etapa", async () => {
    const denied = await projectModule
      .approveActivityCompletion({
        projectId,
        activityId: activityB,
        actorId: gerenteId,
        actorRoles: ["GERENTE"],
        now: NOW,
      })
      .catch((error) => error);
    expect(denied).toBeInstanceOf(ForbiddenError);

    const approved = await projectModule.approveActivityCompletion({
      projectId,
      activityId: activityB,
      actorId: coordinatorId,
      actorRoles: ["COORDENADOR"],
      now: NOW,
    });
    expect(approved.activity.status).toBe("DONE");
    expect(approved.activity.approvedBy).toBe(coordinatorId);
  });

  it("aprovação persiste DONE + quem aprovou; reexecução é 409 (DEC-165)", async () => {
    const approved = await projectModule.approveActivityCompletion({
      projectId,
      activityId: activityA,
      actorId: coordinatorId,
      actorRoles: ["COORDENADOR"],
      now: NOW,
    });

    expect(approved.activity.status).toBe("DONE");
    expect(approved.activity.approvedBy).toBe(coordinatorId);
    expect(approved.activity.approvedAt).toBe(NOW.toISOString());

    const row = await prisma.project_activities.findUnique({ where: { id: activityA } });
    expect(row?.status).toBe("DONE");
    expect(row?.approvedBy).toBe(coordinatorId);

    await expect(
      projectModule.approveActivityCompletion({
        projectId,
        activityId: activityA,
        actorId: coordinatorId,
        actorRoles: ["COORDENADOR"],
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("prêmio 450 distribuído 225/225 nos membros ATIVOS; INATIVO fica fora (DEC-103/104/163/149)", async () => {
    // A etapa A já foi aprovada no teste anterior; a conta congelada é a daquela aprovação:
    // créditos medidos: bolsista1 → task1+task2 = 2; bolsista2 → task2+task3 = 2; inativo → 1
    // (fora da lista ativa); gerente-membro → 0 tarefas.
    const shares = await prisma.history.findMany({
      where: {
        entityType: "USER",
        action: "GAMIFICATION_AWARD",
        description: `GAMIFICATION:ACTIVITY_COMPLETED:${activityA}`,
      },
      select: { entityId: true, newValues: true },
      orderBy: { entityId: "asc" },
    });
    expect(shares).toHaveLength(2);
    // Promise.all cria os usuários em paralelo — a comparação é de conjunto, não de ordem de id.
    expect([...shares.map((row) => row.entityId)].sort((a, b) => a - b)).toEqual(
      [bolsista1Id, bolsista2Id].sort((a, b) => a - b),
    );

    const bolsista1 = await prisma.users.findUnique({ where: { id: bolsista1Id }, select: { points: true } });
    const bolsista2 = await prisma.users.findUnique({ where: { id: bolsista2Id }, select: { points: true } });
    const inativo = await prisma.users.findUnique({ where: { id: inativoId }, select: { points: true } });
    // As duas etapas aprovadas (A e B) têm a mesma grade e a mesma conta: 225 + 225 cada.
    expect(bolsista1?.points).toBe(450);
    expect(bolsista2?.points).toBe(450);
    expect(inativo?.points).toBe(0);
  });

  it("projects.points sobe pelo prêmio com piso 0 (DEC-63/74)", async () => {
    const project = await prisma.projects.findUnique({ where: { id: projectId }, select: { points: true } });
    // Etapa A: 450. Etapa B (mesma grade, mesmo dia): +450. Piso 0 nunca foi tocado — deltas
    // positivos; o piso é provado como regra pura no teste de domínio.
    expect(project?.points).toBe(900);
  });

  it("award já registrado não re-credita: a chave é por (usuário, atividade) no history", async () => {
    const rows = await prisma.history.count({
      where: {
        entityType: "USER",
        action: "GAMIFICATION_AWARD",
        description: `GAMIFICATION:ACTIVITY_COMPLETED:${activityA}`,
      },
    });
    // Uma linha por membro, não duas — a reexecução do teste anterior bateu no 409 antes da economia.
    expect(rows).toBe(2);
  });
});
