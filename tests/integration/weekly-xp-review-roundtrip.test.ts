// @vitest-environment node
/**
 * plan-v8 V8-3 — G4 roundtrip da revisão semanal de XP (DEC-214), só contra o banco de teste
 * isolado em 127.0.0.1:5433 (DEC-10; nunca a 5432 do dono).
 *
 * É o arquivo que congela as CONTAGENS do adaptador — o que nenhum teste de duplo prova, porque a
 * fake entrega fatos semeados:
 *   1. constância conta DIAS CIVIS distintos (dois trechos no mesmo dia são um dia), e só sessão
 *      `status: "completed"` conta: os sete dias de Bruno estão todos com sessão ABERTA e não produzem
 *      boost nem horas;
 *   2. as tarefas da semana saem das DUAS famílias de `users.completedTasks` com o MESMO filtro de
 *      visibilidade do increment (V8-2) — a pública atribuída conta UMA vez, provado consultando o
 *      banco sem o filtro; atrasada é a que `daysLateForTask` (DEC-97) chama de atrasada;
 *   3. as atividades da semana saem do próprio ledger (`ACTIVITY_COMPLETED` criado na janela), a
 *      atrasa é medida contra o `periodoFim` derivado (`activityPeriod`, DEC-103) e a sessão que
 *      quita a penalidade de −30 é a que SOLAPA o período da linha NO MESMO PROJETO: a semana de Ana
 *      está em P1 e quita a atividade B (P1, período maio) mas não quita C (P2, período abril–maio);
 *   4. a janela é `[segunda 00:00 SP, +7d)`: a tarefa e a sessão das 00:00 da segunda seguinte ficam
 *      FORA, e o ledger da revisão guarda a semana (`newValues.weekStart`) com `track "XP"`;
 *   5. idempotência por `(userId, weekStart)`: a segunda run da mesma semana não escreve linha nem
 *      mexe no XP; e a audiência é ampla — suspenso com meta não cumprida também é revisado.
 *
 * A semana usada é a de 05/05/2025 (segunda), longe da semana corrente, para a run não revisar dado
 * vivo da instância de teste. O `now` entra explícito. Cleanup em `afterAll` espelhando o do V8-2.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { systemActor } from "@/backend/domain/identity";
import { createGamificationModule } from "@/backend/modules/gamification";
import { prisma } from "@/lib/database/prisma";

const gamification = createGamificationModule();

const WEEK_FECHADA = "2025-05-05";
const RUN_FECHAMENTO = new Date("2025-05-12T03:10:00.000Z"); // 00:10 de 12/05/2025 em SP
const RUN_REEXECUCAO = new Date("2025-05-15T15:00:00.000Z"); // ainda fecha a semana de 05/05
const BOUNDARY = new Date("2025-05-12T03:00:00.000Z"); // 00:00 de 12/05 em SP — FORA da semana

const stamp = Date.now();

let anaId = 0;
let brunoId = 0;
let carlaId = 0;
let doraId = 0;
let p1Id = 0;
let p2Id = 0;
const createdUserIds: number[] = [];
const createdTaskIds: number[] = [];

function weekDay(day: number, hourUtc = 12): Date {
  return new Date(`2025-05-${String(day).padStart(2, "0")}T${String(hourUtc).padStart(2, "0")}:00:00.000Z`);
}

function reviewLineDescription(userId: number, weekStart: string = WEEK_FECHADA): string {
  return `GAMIFICATION:XP:WEEKLY_REVIEW:${userId}:${weekStart}`;
}

describe("G4 roundtrip — revisão semanal de XP (isolated test DB, 5433)", () => {
  beforeAll(async () => {
    const seeds = [
      { key: "ana", name: "Ana Semana Cheia", email: "xp-ana", xp: 100, points: 33, weekHours: 20, status: "active" as const },
      { key: "bruno", name: "Bruno So Sessao Aberta", email: "xp-bruno", xp: 20, points: 7, weekHours: 20, status: "active" as const },
      { key: "carla", name: "Carla Sem Semana", email: "xp-carla", xp: 70, points: 3, weekHours: 0, status: "active" as const },
      { key: "dora", name: "Dora Suspensa", email: "xp-dora", xp: 5, points: 0, weekHours: 20, status: "suspended" as const },
    ];
    for (const seed of seeds) {
      const created = await prisma.users.create({
        data: {
          name: `V8-3 ${seed.name} ${stamp}`,
          email: `v8-3-${seed.email}-${stamp}@test.local`,
          password: "g4-dummy-hash",
          status: seed.status,
          roles: ["VOLUNTARIO"],
          xp: seed.xp,
          points: seed.points,
          weekHours: seed.weekHours,
        },
        select: { id: true },
      });
      createdUserIds.push(created.id);
      if (seed.key === "ana") anaId = created.id;
      if (seed.key === "bruno") brunoId = created.id;
      if (seed.key === "carla") carlaId = created.id;
      if (seed.key === "dora") doraId = created.id;
    }

    for (const name of ["P1", "P2"]) {
      const project = await prisma.projects.create({
        data: {
          name: `V8-3 projeto ${name} ${stamp}`,
          createdAt: "2025-01-01",
          status: "active",
          createdBy: anaId,
        },
        select: { id: true },
      });
      if (name === "P1") p1Id = project.id;
      else p2Id = project.id;
    }

    // Sessões de Ana na semana: sete dias civis (seg–dom), dois trechos na terça, todas concluídas
    // e no projeto P1. 3 h × 7 + 1 h = 22 h (meta 20 h atingida: sem penalidade de meta).
    const anaSessions = [
      { day: 5, duration: 3 },
      { day: 6, duration: 3 },
      { day: 6, duration: 1 },
      { day: 7, duration: 3 },
      { day: 8, duration: 3 },
      { day: 9, duration: 3 },
      { day: 10, duration: 3 },
      { day: 11, duration: 3 },
    ];
    for (const session of anaSessions) {
      await prisma.work_sessions.create({
        data: {
          userId: anaId,
          userName: `V8-3 Ana ${stamp}`,
          startTime: weekDay(session.day),
          endTime: new Date(weekDay(session.day).getTime() + session.duration * 3600_000),
          duration: session.duration,
          projectId: p1Id,
          status: "completed",
        },
      });
    }

    // Bruno: sete dias com sessão ABERTA (status legado `active`) de 4 h cada. Se o adaptador contar
    // sessão não concluída, ele ganha constância (+40) e as 28 h quitam a meta — o net dele é a
    // prova de que só `completed` entra.
    for (const day of [5, 6, 7, 8, 9, 10, 11]) {
      await prisma.work_sessions.create({
        data: {
          userId: brunoId,
          userName: `V8-3 Bruno ${stamp}`,
          startTime: weekDay(day),
          endTime: new Date(weekDay(day).getTime() + 4 * 3600_000),
          duration: 4,
          status: "active",
        },
      });
    }

    // Corte de fim: sessão e tarefa das 00:00 de 12/05 em SP são da semana SEGUINTE.
    await prisma.work_sessions.create({
      data: {
        userId: anaId,
        userName: `V8-3 Ana fronteira ${stamp}`,
        startTime: BOUNDARY,
        endTime: new Date(BOUNDARY.getTime() + 5 * 3600_000),
        duration: 5,
        projectId: p1Id,
        status: "completed",
      },
    });

    async function createTask(input: {
      title: string;
      dueDate?: string;
      completedAt: Date;
      userId: number;
      public?: boolean;
    }) {
      const created = await prisma.tasks.create({
        data: {
          title: `V8-3 ${input.title} ${stamp}`,
          status: "done",
          priority: "medium",
          taskVisibility: input.public ? "public" : "delegated",
          isGlobal: false,
          assignedTo: input.userId,
          completed: true,
          completedAt: input.completedAt,
          dueDate: input.dueDate ?? null,
          createdBy: anaId,
        },
        select: { id: true },
      });
      createdTaskIds.push(created.id);
      return created;
    }

    // Ana: 5 delegadas no prazo, 1 atrasada (prazo 05/05, concluída 08/05 = 3 dias), 1 na fronteira
    // da semana (FORA), 1 pública também atribuída (linha de progresso).
    for (const day of [5, 6, 7, 8, 9]) {
      await createTask({ title: `no prazo ${day}`, completedAt: weekDay(day), userId: anaId });
    }
    await createTask({ title: "atrasada", dueDate: "2025-05-05", completedAt: weekDay(8), userId: anaId });
    await createTask({ title: "fronteira", completedAt: BOUNDARY, userId: anaId });
    const publica = await createTask({ title: "publica atribuida", completedAt: weekDay(6), userId: anaId, public: true });
    await prisma.task_user_progress.create({
      data: { taskId: publica.id, userId: anaId, status: "done", completedAt: weekDay(6) },
    });

    // Bruno: duas delegadas atrasadas (prazo 05/05, concluídas 09/05 = 4 dias).
    await createTask({ title: "bruno atrasada 1", dueDate: "2025-05-05", completedAt: weekDay(9), userId: brunoId });
    await createTask({ title: "bruno atrasada 2", dueDate: "2025-05-05", completedAt: weekDay(9), userId: brunoId });

    // As três atividades da semana, pelo ledger que a distribuição Hamilton deixou para trás
    // (DEC-164): A atrasada e sem sessão no período, B no prazo e quitada pela sessão do projeto,
    // C no prazo em OUTRO projeto (as sessões da semana de Ana são P1 e não quitam C).
    const activities = [
      { key: "A", projectId: p2Id, firstMonth: "2025-03", lastMonth: "2025-03", approvedAt: weekDay(7) },
      { key: "B", projectId: p1Id, firstMonth: "2025-05", lastMonth: "2025-05", approvedAt: weekDay(8) },
      { key: "C", projectId: p2Id, firstMonth: "2025-04", lastMonth: "2025-05", approvedAt: weekDay(9) },
    ];
    const activityIds: Record<string, number> = {};
    for (const [index, activity] of activities.entries()) {
      const created = await prisma.project_activities.create({
        data: {
          projectId: activity.projectId,
          order: index + 1,
          description: `V8-3 atividade ${activity.key} ${stamp}`,
          firstMonth: activity.firstMonth,
          lastMonth: activity.lastMonth,
          status: "DONE",
          approvedAt: activity.approvedAt,
          approvedBy: anaId,
        },
        select: { id: true },
      });
      activityIds[activity.key] = created.id;
    }
    for (const [key, performedAt] of [["A", weekDay(7, 13)], ["B", weekDay(8, 13)], ["C", weekDay(9, 13)]] as const) {
      await prisma.history.create({
        data: {
          entityType: "USER",
          entityId: anaId,
          action: "GAMIFICATION_AWARD",
          performedBy: anaId,
          performedAt,
          track: "POINTS",
          description: `GAMIFICATION:ACTIVITY_COMPLETED:${activityIds[key]}:${anaId}`,
          newValues: { sourceType: "ACTIVITY_COMPLETED", sourceId: activityIds[key], pointsAwarded: 20 },
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.task_user_progress.deleteMany({ where: { taskId: { in: createdTaskIds } } });
    await prisma.tasks.deleteMany({ where: { id: { in: createdTaskIds } } });
    await prisma.work_sessions.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.project_activities.deleteMany({ where: { projectId: { in: [p1Id, p2Id] } } });
    await prisma.projects.deleteMany({ where: { id: { in: [p1Id, p2Id] } } });
    await prisma.history.deleteMany({
      where: { OR: [{ performedBy: { in: createdUserIds } }, { description: { contains: "WEEKLY_REVIEW" } }] },
    });
    await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  async function reviewWeek(now: Date) {
    return gamification.reviewWeeklyXp({ actor: systemActor("WEEKLY_XP_REVIEW"), now });
  }

  async function xpOf(userId: number) {
    return (await prisma.users.findUnique({ where: { id: userId }, select: { xp: true } }))?.xp;
  }

  async function pointsOf(userId: number) {
    return (await prisma.users.findUnique({ where: { id: userId }, select: { points: true } }))?.points;
  }

  async function reviewLineOf(userId: number, weekStart: string = WEEK_FECHADA) {
    return prisma.history.findFirst({
      where: { entityType: "USER", entityId: userId, action: "GAMIFICATION_AWARD", description: reviewLineDescription(userId, weekStart) },
    });
  }

  it("o adaptador conta a semana como o sistema credita: dias civis, duas famílias de tarefa e o ledger de atividade", async () => {
    const result = await reviewWeek(RUN_FECHAMENTO);
    expect(result.weekStart).toBe(WEEK_FECHADA);

    const ana = result.outcomes.find((o) => o.userId === anaId)!;
    expect(ana.status).toBe("adjusted");
    expect(ana.adjustments).toEqual([
      { code: "WEEK_DAYS_SESSION", units: 7, amount: 40 }, // 8 trechos, 7 dias; a sessão da fronteira fora
      // 6 delegadas (a pública sai) + 1 progresso = 7: o degrau de 5+ (o de 10+ é o caso da
      // substituição, congelado em xp-rules.test.ts e no teste do use case). A da fronteira ficou fora.
      { code: "TASKS_MEDIUM", units: 7, amount: 20 },
      { code: "TASKS_LATE", units: 1, amount: -10 },
      { code: "ACTIVITIES_LATE", units: 1, amount: -20 }, // A: aprovada 08/05 contra período terminado 31/03
      { code: "ACTIVITIES_WITHOUT_SESSION", units: 2, amount: -60 }, // A e C; B é quitada pela sessão de P1
    ]);
    // +40 +20 −10 −20 −60 = −30. Meta 20 h contra 22 h trabalhadas: sem penalidade de meta.
    expect(ana.netAmount).toBe(-30);
    expect(ana.xpBefore).toBe(100);
    expect(ana.xpAfter).toBe(70);
    expect(await xpOf(anaId)).toBe(70);

    const bruno = result.outcomes.find((o) => o.userId === brunoId)!;
    // Nenhuma sessão CONCLUÍDA: sem constância e sem horas → a meta não cumprida cobra −20.
    expect(bruno.adjustments).toEqual([
      { code: "TASKS_LATE", units: 2, amount: -20 },
      { code: "WEEKLY_GOAL", units: 1, amount: -20 },
    ]);
    expect(bruno.netAmount).toBe(-40);
    expect(bruno.xpAfter).toBe(0); // 20 − 40 → piso 0 (DEC-214)
    expect(await xpOf(brunoId)).toBe(0);

    const carla = result.outcomes.find((o) => o.userId === carlaId)!;
    expect(carla.status).toBe("without-adjustment");
    expect(await reviewLineOf(carlaId)).toBeNull();
    expect(await xpOf(carlaId)).toBe(70);

    // Audiência ampla (mesma escolha do fechamento mensal): suspenso com meta não cumprida é revisado.
    const dora = result.outcomes.find((o) => o.userId === doraId)!;
    expect(dora.status).toBe("adjusted");
    expect(dora.netAmount).toBe(-20);
    expect(dora.xpAfter).toBe(0);
  });

  it("a linha escrita é o livro-caixa da semana: track XP, chave de reexecução e a decisão item a item", async () => {
    const line = await reviewLineOf(anaId);
    expect(line).not.toBeNull();
    expect(line?.track).toBe("XP");
    expect(line?.description).toBe(reviewLineDescription(anaId));
    expect(line?.oldValues).toMatchObject({ xp: 100 });

    const values = line?.newValues as {
      weekStart: string;
      netAmount: number;
      xpBefore: number;
      xpAfter: number;
      adjustments: Array<{ code: string; units: number; amount: number }>;
    };
    expect(values.weekStart).toBe(WEEK_FECHADA);
    expect(values.netAmount).toBe(-30);
    expect(values.xpBefore).toBe(100);
    expect(values.xpAfter).toBe(70);
    expect(values.adjustments.map((a) => a.code)).toEqual([
      "WEEK_DAYS_SESSION",
      "TASKS_MEDIUM",
      "TASKS_LATE",
      "ACTIVITIES_LATE",
      "ACTIVITIES_WITHOUT_SESSION",
    ]);
  });

  it("a revisão não toca a trilha dos pontos (DEC-212 é outro ciclo)", async () => {
    expect(await pointsOf(anaId)).toBe(33);
    expect(await pointsOf(brunoId)).toBe(7);
    expect(await pointsOf(carlaId)).toBe(3);
  });

  it("reexecutar a mesma semana não escreve linha nova nem mexe no XP", async () => {
    await prisma.users.update({ where: { id: anaId }, data: { xp: 130 } });

    const segunda = await reviewWeek(RUN_REEXECUCAO);
    const outcome = segunda.outcomes.find((o) => o.userId === anaId);
    expect(outcome?.status).toBe("already-reviewed");
    expect(segunda.adjusted).toBe(0);

    const lines = await prisma.history.count({
      where: { entityType: "USER", entityId: anaId, action: "GAMIFICATION_AWARD", description: reviewLineDescription(anaId) },
    });
    expect(lines).toBe(1);
    // O XP ganho depois, na semana em curso, fica intacto.
    expect(await xpOf(anaId)).toBe(130);
  });

  it("as duas famílias não contam a pública atribuída duas vezes, e as sessões de outro projeto não quitam atividade", async () => {
    const start = new Date("2025-05-05T03:00:00.000Z");
    const endExclusive = new Date("2025-05-12T03:00:00.000Z");

    const progressos = await prisma.task_user_progress.count({
      where: { userId: anaId, completedAt: { gte: start, lt: endExclusive } },
    });
    const delegadasSemFiltro = await prisma.tasks.count({
      where: { assignedTo: anaId, completedAt: { gte: start, lt: endExclusive } },
    });
    expect(progressos).toBe(1);
    expect(delegadasSemFiltro).toBe(7); // inclui a pública atribuída e exclui a da fronteira
    // 1 + 7 − 1 = 7, o `units` de TASKS_HIGH fotografado no ledger.
    const line = await reviewLineOf(anaId);
    const tasks = (line?.newValues as { adjustments: Array<{ code: string; units: number }> }).adjustments.find(
      (a) => a.code === "TASKS_MEDIUM",
    );
    expect(tasks?.units).toBe(progressos + delegadasSemFiltro - 1);

    // A semana inteira de Ana é no projeto P1. A atividade C (P2) tem período cobrindo a semana e
    // mesmo assim ficou sem sessão: o escopo de projeto é o que separa −30 de "quitada".
    const semSessao = (line?.newValues as { adjustments: Array<{ code: string; units: number }> }).adjustments.find(
      (a) => a.code === "ACTIVITIES_WITHOUT_SESSION",
    );
    expect(semSessao?.units).toBe(2);

    const sessoesP1NaSemana = await prisma.work_sessions.count({
      where: { userId: anaId, status: "completed", startTime: { gte: start, lt: endExclusive }, projectId: p1Id },
    });
    expect(sessoesP1NaSemana).toBe(8);
  });
});
