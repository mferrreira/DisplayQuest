// @vitest-environment node
/**
 * plan-v8 V8-2 — G4 roundtrip do fechamento mensal (DEC-212), só contra o banco de teste isolado
 * em 127.0.0.1:5433 (DEC-10; nunca a 5432 do dono).
 *
 * O que este arquivo prova com Prisma real, pelo caminho inteiro (use case → port → adapter →
 * transação no banco), que nenhum teste de duplo prova:
 *   1. o par "snapshot + zeragem" acontece JUNTO numa `$transaction`: existe linha em
 *      `month_history` e `users.points` está em 0 — e o negativo fotografado (-65) sobrevive no
 *      histórico enquanto a coluna é perdoada;
 *   2. a contagem de tarefas do mês é feita das DUAS famílias que hoje incrementam
 *      `users.completedTasks` (`task_user_progress.completedAt` e `tasks.completedAt` da aprovação
 *      de tarefa delegada, com a MESMA condição de visibilidade do increment), e uma tarefa pública
 *      com linha de progresso conta UMA vez, não duas;
 *   3. idempotência por `(userId, month)`: segunda run não cria linha e NÃO zera o saldo do mês em
 *      curso — é o PLAN.md pedindo "reexecutar, provar que não duplica";
 *   4. o mês seguinte tem janela e linha próprias, começando do saldo novo;
 *   5. suspenso com saldo fecha histórico (audiência ampla).
 *
 * O `now` entra explícito no comando e o mês escolhido é 2025-05 — longe do mês corrente, para que
 * a run não feche dado vivo da instância de teste. As asserções olham para os usuários criados por
 * este arquivo. Cleanup em afterAll: as tarefas (FK `createdBy` RESTRICT), depois os `month_history`
 * do mês usado (cascade com o usuário também os apagaria), depois os usuários.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { systemActor } from "@/backend/domain/identity";
import { createGamificationModule } from "@/backend/modules/gamification";
import { prisma } from "@/lib/database/prisma";

const gamification = createGamificationModule();

const MONTH_FECHADO = "2025-05";
const RUN_FECHAMENTO = new Date("2025-06-01T03:00:00.000Z"); // 00:00 de 01/06/2025 em SP
const RUN_MES_SEGUINTE = new Date("2025-07-01T03:00:00.000Z"); // fecha 2025-06

const stamp = Date.now();

let comSaldoId = 0;
let noVermelhoId = 0;
let suspensaId = 0;
let semNadaId = 0;
const createdUserIds: number[] = [];
const createdTaskIds: number[] = [];

function monthDate(day: number, hourUtc = 12): Date {
  return new Date(`2025-05-${String(day).padStart(2, "0")}T${String(hourUtc).padStart(2, "0")}:00:00.000Z`);
}

describe("G4 roundtrip — fechamento mensal do placar (isolated test DB, 5433)", () => {
  beforeAll(async () => {
    const seeds = [
      { name: "Ana Mês", email: "mes-ana", points: 830, status: "active" as const },
      { name: "Bruno Vermelho", email: "mes-bruno", points: -65, status: "active" as const },
      { name: "Dani Suspensa", email: "mes-dani", points: 90, status: "suspended" as const },
      { name: "Carla Nada", email: "mes-carla", points: 0, status: "active" as const },
    ];

    for (const seed of seeds) {
      const created = await prisma.users.create({
        data: {
          name: `V8-2 ${seed.name} ${stamp}`,
          email: `v8-2-${seed.email}-${stamp}@test.local`,
          password: "g4-dummy-hash",
          status: seed.status,
          roles: ["VOLUNTARIO"],
          points: seed.points,
        },
        select: { id: true },
      });
      createdUserIds.push(created.id);
      if (seed.name === "Ana Mês") comSaldoId = created.id;
      if (seed.name === "Bruno Vermelho") noVermelhoId = created.id;
      if (seed.name === "Dani Suspensa") suspensaId = created.id;
      if (seed.name === "Carla Nada") semNadaId = created.id;
    }

    // Família 1 — conclusão individual (pública): linha de progresso datada.
    const publica = await prisma.tasks.create({
      data: {
        title: `V8-2 publica ${stamp}`,
        status: "done",
        priority: "medium",
        taskVisibility: "public",
        isGlobal: true,
        completed: true,
        completedAt: monthDate(10),
        createdBy: comSaldoId,
      },
      select: { id: true },
    });
    createdTaskIds.push(publica.id);
    await prisma.task_user_progress.create({
      data: { taskId: publica.id, userId: comSaldoId, status: "done", completedAt: monthDate(10) },
    });

    // Família 2 — aprovação de tarefa delegada: credita o responsável sem linha de progresso
    // (approve-task.use-case.ts incrementa `assignedTo` só quando NÃO é pública e NÃO é global).
    const delegada = await prisma.tasks.create({
      data: {
        title: `V8-2 delegada ${stamp}`,
        status: "done",
        priority: "medium",
        taskVisibility: "delegated",
        isGlobal: false,
        assignedTo: comSaldoId,
        completed: true,
        completedAt: monthDate(20),
        createdBy: comSaldoId,
      },
      select: { id: true },
    });
    createdTaskIds.push(delegada.id);

    // Corte: uma delegada em ABRIL (mês anterior) e uma às 23:59:59 de 31/05 (SP) — entram as duas
    // no mês; e uma às 00:00 de 01/06 (SP) que NÃO entra.
    const abril = await prisma.tasks.create({
      data: {
        title: `V8-2 abril ${stamp}`,
        status: "done",
        priority: "medium",
        taskVisibility: "delegated",
        isGlobal: false,
        assignedTo: comSaldoId,
        completed: true,
        completedAt: new Date("2025-04-20T12:00:00.000Z"),
        createdBy: comSaldoId,
      },
      select: { id: true },
    });
    createdTaskIds.push(abril.id);

    const viradaDoMes = await prisma.tasks.create({
      data: {
        title: `V8-2 virada ${stamp}`,
        status: "done",
        priority: "medium",
        taskVisibility: "delegated",
        isGlobal: false,
        assignedTo: comSaldoId,
        completed: true,
        completedAt: new Date("2025-05-31T23:59:59.000Z"), // 20:59 de 31/05 em SP — DENTRO
        createdBy: comSaldoId,
      },
      select: { id: true },
    });
    createdTaskIds.push(viradaDoMes.id);

    const depoisDaVirada = await prisma.tasks.create({
      data: {
        title: `V8-2 junho ${stamp}`,
        status: "done",
        priority: "medium",
        taskVisibility: "delegated",
        isGlobal: false,
        assignedTo: comSaldoId,
        completed: true,
        completedAt: new Date("2025-06-01T03:00:00.000Z"), // 00:00 de 01/06 em SP — FORA de maio
        createdBy: comSaldoId,
      },
      select: { id: true },
    });
    createdTaskIds.push(depoisDaVirada.id);

    // Progresso de outro mês (abril) — não conta em maio.
    const progressoAbril = await prisma.tasks.create({
      data: {
        title: `V8-2 progresso abril ${stamp}`,
        status: "done",
        priority: "medium",
        taskVisibility: "public",
        isGlobal: true,
        completed: true,
        completedAt: new Date("2025-04-15T12:00:00.000Z"),
        createdBy: comSaldoId,
      },
      select: { id: true },
    });
    createdTaskIds.push(progressoAbril.id);
    await prisma.task_user_progress.create({
      data: {
        taskId: progressoAbril.id,
        userId: comSaldoId,
        status: "done",
        completedAt: new Date("2025-04-15T12:00:00.000Z"),
      },
    });

    // A tarefa pública também pode ser atribuída: conta pela linha de progresso, e a query de
    // delegadas exclui pública — senão a mesma tarefa contaria duas vezes.
    const publicaAtribuida = await prisma.tasks.create({
      data: {
        title: `V8-2 publica atribuida ${stamp}`,
        status: "done",
        priority: "medium",
        taskVisibility: "public",
        isGlobal: false,
        assignedTo: comSaldoId,
        completed: true,
        completedAt: monthDate(25),
        createdBy: comSaldoId,
      },
      select: { id: true },
    });
    createdTaskIds.push(publicaAtribuida.id);
    await prisma.task_user_progress.create({
      data: { taskId: publicaAtribuida.id, userId: comSaldoId, status: "done", completedAt: monthDate(25) },
    });

    // Suspensa com atividade no mês.
    const daSuspensa = await prisma.tasks.create({
      data: {
        title: `V8-2 suspensa ${stamp}`,
        status: "done",
        priority: "medium",
        taskVisibility: "delegated",
        isGlobal: false,
        assignedTo: suspensaId,
        completed: true,
        completedAt: monthDate(8),
        createdBy: comSaldoId,
      },
      select: { id: true },
    });
    createdTaskIds.push(daSuspensa.id);
  });

  afterAll(async () => {
    await prisma.task_user_progress.deleteMany({ where: { taskId: { in: createdTaskIds } } });
    await prisma.tasks.deleteMany({ where: { id: { in: createdTaskIds } } });
    await prisma.month_history.deleteMany({ where: { month: { in: [MONTH_FECHADO, "2025-06"] } } });
    await prisma.history.deleteMany({ where: { performedBy: { in: createdUserIds } } });
    await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  async function closeMonth(now: Date) {
    return gamification.resetMonthlyPoints({
      actor: systemActor("MONTHLY_POINTS_RESET"),
      now,
    });
  }

  function snapshotOf(userId: number, month: string = MONTH_FECHADO) {
    return prisma.month_history.findFirst({ where: { userId, month } });
  }

  async function pointsOf(userId: number) {
    const row = await prisma.users.findUnique({ where: { id: userId }, select: { points: true } });
    return row?.points;
  }

  it("o fechamento fotografia saldo e tarefas do mês e zera a coluna — na MESMA transação", async () => {
    const result = await closeMonth(RUN_FECHAMENTO);

    expect(result.month).toBe(MONTH_FECHADO);

    // Ana: pública com progresso (25/05 e 10/05) + delegada (20/05) + virada 23:59:59 de 31/05 = 4.
    // Abril e 00:00 de 01/06 ficam fora.
    const ana = await snapshotOf(comSaldoId);
    expect(ana).toMatchObject({ month: MONTH_FECHADO, points: 830, completedTasks: 4 });
    expect(await pointsOf(comSaldoId)).toBe(0);

    // O negativo é fotografado e perdoado na coluna.
    const bruno = await snapshotOf(noVermelhoId);
    expect(bruno).toMatchObject({ points: -65, completedTasks: 0 });
    expect(await pointsOf(noVermelhoId)).toBe(0);
  });

  it("a audiência é ampla: suspenso com saldo fecha histórico; saldo 0 sem atividade não ganha linha", async () => {
    const dani = await snapshotOf(suspensaId);
    expect(dani).toMatchObject({ points: 90, completedTasks: 1 });
    expect(await pointsOf(suspensaId)).toBe(0);

    expect(await snapshotOf(semNadaId)).toBeNull();
    expect(await pointsOf(semNadaId)).toBe(0);
  });

  it("reexecutar não duplica linha e não zera o saldo do mês em curso", async () => {
    await prisma.users.update({ where: { id: comSaldoId }, data: { points: 120 } });

    const segunda = await closeMonth(new Date("2025-06-20T15:00:00.000Z"));

    expect(segunda.month).toBe(MONTH_FECHADO);
    const outcome = segunda.outcomes.find((o) => o.userId === comSaldoId);
    expect(outcome?.status).toBe("already-closed");

    expect(await prisma.month_history.count({ where: { userId: comSaldoId, month: MONTH_FECHADO } })).toBe(1);
    // O saldo de junho está intacto: a segunda run NÃO zerou de novo.
    expect(await pointsOf(comSaldoId)).toBe(120);
  });

  it("o mês seguinte fecha com janela e linha próprias, começando do saldo novo", async () => {
    const junho = await closeMonth(RUN_MES_SEGUINTE);
    expect(junho.month).toBe("2025-06");

    // Só a tarefa das 00:00 de 01/06 (SP) é de junho.
    const snapshot = await snapshotOf(comSaldoId, "2025-06");
    expect(snapshot).toMatchObject({ points: 120, completedTasks: 1 });
    expect(await pointsOf(comSaldoId)).toBe(0);

    const meses = await prisma.month_history.findMany({
      where: { userId: comSaldoId },
      orderBy: { month: "asc" },
    });
    expect(meses.map((m) => [m.month, m.points])).toEqual([
      [MONTH_FECHADO, 830],
      ["2025-06", 120],
    ]);
  });

  it("as duas famílias de conclusão não contam a tarefa pública atribuída duas vezes", async () => {
    // O adapter soma `task_user_progress.completedAt` + `tasks.completedAt` das DELEGADAS (a mesma
    // condição do increment em approve-task.use-case.ts). Sem o filtro de visibilidade, a pública
    // atribuída entraria nas duas queries e o número cresceria — é isto que o caso congela.
    const start = new Date("2025-05-01T03:00:00.000Z");
    const endExclusive = new Date("2025-06-01T03:00:00.000Z");

    const progressos = await prisma.task_user_progress.count({
      where: { userId: comSaldoId, completedAt: { gte: start, lt: endExclusive } },
    });
    const atribuidasSemFiltroDeVisibilidade = await prisma.tasks.count({
      where: { assignedTo: comSaldoId, completedAt: { gte: start, lt: endExclusive } },
    });

    expect(progressos).toBe(2);
    expect(atribuidasSemFiltroDeVisibilidade).toBe(3); // inclui a pública atribuída

    const fotografado = await prisma.month_history.findFirst({
      where: { userId: comSaldoId, month: MONTH_FECHADO },
      select: { completedTasks: true },
    });
    // 2 + 3 - 1: a pública saiu da segunda query, e o que o banco gravou é 4.
    expect(fotografado?.completedTasks).toBe(progressos + atribuidasSemFiltroDeVisibilidade - 1);
  });
});
