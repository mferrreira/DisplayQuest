// @vitest-environment node
/**
 * plan-v8 V8-7 — G4 roundtrip do quadro do mês (DEC-220), só contra o banco de teste isolado em
 * 127.0.0.1:5433 (DEC-10; nunca a 5432 do dono).
 *
 * O que este arquivo prova com Prisma real, pelo caminho inteiro (use case → port → adaptador de lote
 * → banco), que nenhum teste de duplo prova:
 *   1. o LOTE do quadro (`groupBy` em `task_user_progress` + `groupBy` em `tasks`) devolve, pessoa por
 *      pessoa, o MESMO número que `UserStatsPort.countTasksCompletedSince` (a contagem por pessoa do
 *      fechamento mensal, da revisão de XP e do critério de troféu). É a prova de que o lote não é uma
 *      segunda régua: as condições são conferidas por texto em `trophy-window-guard.test.ts` e o
 *      número é conferido aqui, contra o banco;
 *   2. tarefa PÚBLICA atribuída e com linha de progresso conta UMA vez (família 1), não duas: a query
 *      de delegadas exclui `taskVisibility: "public"`;
 *   3. a régua do desempate (pontos → tarefas do mês → XP → userId) é medida com dados do banco, e a
 *      ordem dos empatados sai pelo `userId` crescente;
 *   4. o ELO do quadro é derivado do XP: a pessoa está com a COLUNA `users.elo` em DIAMANTE e XP 0, e
 *      a linha diz BRONZE. Ler a coluna seria mostrar um degrau que não casa com os slots que a escada
 *      abre (DEC-217);
 *   5. as duas contagens de troféu (equipados / total) vêm de `user_badges`;
 *   6. o corte da janela é exclusivo no fim: a conclusão das `00:00` de 1º/jun (SP) não entra em maio.
 *
 * O mês usado é 2025-05, longe do mês em curso, e as asserções olham só para os usuários criados por
 * este arquivo (o quadro lê o cadastro inteiro, inclusive o dado vivo da instância de teste).
 * Cleanup em afterAll: progresso de tarefa, tarefas (FK `createdBy` RESTRICT), os troféus do catálogo
 * criados aqui (FK `user_badges.badgeId` cascadeia a conquista, mas `badges.createdBy` é RESTRICT com
 * `users` — a ordem importa, lição medida no fechamento da V8-6), linhas de `history` assinadas por
 * eles, e por fim os usuários.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { currentMonthOfInstant, monthWindow } from "@/backend/domain";
import { createGamificationModule } from "@/backend/modules/gamification";
import { createPrismaUserStatsPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-user-stats.port";
import { prisma } from "@/lib/database/prisma";

const gamification = createGamificationModule();
const stats = createPrismaUserStatsPort();

const MONTH_OF_THE_RUN = "2025-05";
/** 15/05/2025 ao meio-dia (UTC) — dentro do mês medido, longe do mês em curso da instância. */
const NOW = new Date("2025-05-15T15:00:00.000Z");

const stamp = Date.now();

let anaId = 0;
let brunoId = 0;
let carlaId = 0;
let daniId = 0;
const createdUserIds: number[] = [];
const createdTaskIds: number[] = [];
const createdBadgeIds: number[] = [];

function mayDate(day: number, hourUtc = 12): Date {
  return new Date(`2025-05-${String(day).padStart(2, "0")}T${String(hourUtc).padStart(2, "0")}:00:00.000Z`);
}

describe("G4 roundtrip — quadro do mês em curso (isolated test DB, 5433)", () => {
  beforeAll(async () => {
    const seeds = [
      // 50 pontos, XP 0, TAREFA 1 no mês — a COLUNA elo é posta em DIAMANTE de propósito (o decoy).
      { name: "Ana Quadro", key: "ana", points: 50, xp: 0, coins: 7, elo: "DIAMANTE" },
      // 50 pontos, XP 400, DUAS tarefas no mês: passa a Ana no desempate de tarefa.
      { name: "Bruno Quadro", key: "bruno", points: 50, xp: 400, coins: 3, elo: "BRONZE" },
      // Idêntico ao Bruno em tudo, só id maior: o desempate fecha por userId crescente.
      { name: "Carla Quadro", key: "carla", points: 50, xp: 400, coins: 0, elo: "BRONZE" },
      // 10 pontos: tarefa não resgata placar menor.
      { name: "Dani Quadro", key: "dani", points: 10, xp: 900, coins: 1, elo: "BRONZE" },
    ];

    for (const seed of seeds) {
      const created = await prisma.users.create({
        data: {
          name: `V8-7 ${seed.name} ${stamp}`,
          email: `v8-7-${seed.key}-${stamp}@test.local`,
          password: "g4-dummy-hash",
          status: "active",
          roles: ["VOLUNTARIO"],
          points: seed.points,
          xp: seed.xp,
          coins: seed.coins,
          elo: seed.elo,
        },
        select: { id: true },
      });
      createdUserIds.push(created.id);
      if (seed.key === "ana") anaId = created.id;
      if (seed.key === "bruno") brunoId = created.id;
      if (seed.key === "carla") carlaId = created.id;
      if (seed.key === "dani") daniId = created.id;
    }

    async function task(data: {
      title: string
      assignedTo?: number
      taskVisibility: "public" | "delegated"
      isGlobal: boolean
      completedAt: Date
    }) {
      const created = await prisma.tasks.create({
        data: {
          title: `${data.title} ${stamp}`,
          status: "done",
          priority: "medium",
          taskVisibility: data.taskVisibility,
          isGlobal: data.isGlobal,
          assignedTo: data.assignedTo ?? null,
          completed: true,
          completedAt: data.completedAt,
          createdBy: anaId,
        },
        select: { id: true },
      });
      createdTaskIds.push(created.id);
      return created.id;
    }

    // Ana — família 1: conclusão individual numa tarefa PÚBLICA (sem dono). Conta 1.
    const publicaDeTerceiro = await task({
      title: "V8-7 publica progresso",
      taskVisibility: "public",
      isGlobal: true,
      completedAt: mayDate(10),
    });
    await prisma.task_user_progress.create({
      data: { taskId: publicaDeTerceiro, userId: anaId, status: "done", completedAt: mayDate(10) },
    });

    // Bruno — família 2: duas delegadas aprovadas (sem linha de progresso). Contam 2.
    await task({ title: "V8-7 bruno delegada 1", assignedTo: brunoId, taskVisibility: "delegated", isGlobal: false, completedAt: mayDate(11) });
    await task({ title: "V8-7 bruno delegada 2", assignedTo: brunoId, taskVisibility: "delegated", isGlobal: false, completedAt: mayDate(12) });

    // Carla — família 2: duas delegadas, idêntico ao Bruno em tudo menos o id.
    await task({ title: "V8-7 carla delegada 1", assignedTo: carlaId, taskVisibility: "delegated", isGlobal: false, completedAt: mayDate(13) });
    await task({ title: "V8-7 carla delegada 2", assignedTo: carlaId, taskVisibility: "delegated", isGlobal: false, completedAt: mayDate(14) });

    // Dani — a tarefa PÚBLICA ATRIBUÍDA com linha de progresso: só a família 1 conta, UMA vez.
    const publicaAtribuida = await task({
      title: "V8-7 publica atribuida",
      assignedTo: daniId,
      taskVisibility: "public",
      isGlobal: false,
      completedAt: mayDate(15),
    });
    await prisma.task_user_progress.create({
      data: { taskId: publicaAtribuida, userId: daniId, status: "done", completedAt: mayDate(15) },
    });
    // Fora da janela: as 00:00 de 01/06 (SP) são o corte EXCLUSIVO de maio.
    await prisma.tasks.create({
      data: {
        title: `V8-7 fora da janela ${stamp}`,
        status: "done",
        priority: "medium",
        taskVisibility: "delegated",
        isGlobal: false,
        assignedTo: daniId,
        completed: true,
        completedAt: new Date("2025-06-01T03:00:00.000Z"),
        createdBy: anaId,
      },
      select: { id: true },
    }).then((created) => createdTaskIds.push(created.id));

    // Troféus de Ana: dois conquistados, um equipado. O catálogo é criado por ela (createdBy RESTRICT).
    for (const badgeName of ["V8-7 trofeu equipado", "V8-7 trofeu na prateleira"]) {
      const badge = await prisma.badges.create({
        data: { name: `${badgeName} ${stamp}`, description: "troféu do roundtrip", category: "achievement", isActive: true, createdBy: anaId },
        select: { id: true },
      });
      createdBadgeIds.push(badge.id);
      await prisma.user_badges.create({
        data: { userId: anaId, badgeId: badge.id, equipped: badgeName.endsWith("equipado"), earnedBy: anaId },
      });
    }
  });

  afterAll(async () => {
    await prisma.task_user_progress.deleteMany({ where: { taskId: { in: createdTaskIds } } });
    await prisma.tasks.deleteMany({ where: { id: { in: createdTaskIds } } });
    await prisma.badges.deleteMany({ where: { id: { in: createdBadgeIds } } });
    await prisma.history.deleteMany({ where: { performedBy: { in: createdUserIds } } });
    await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("o mês do quadro é o mês do now, e as tarefas do lote batem com a contagem por pessoa", async () => {
    const result = await gamification.listMonthlyRanking({ now: NOW });

    expect(result.month).toBe(currentMonthOfInstant(NOW));
    expect(result.month).toBe(MONTH_OF_THE_RUN);

    const window = monthWindow(MONTH_OF_THE_RUN);
    for (const userId of [anaId, brunoId, carlaId, daniId]) {
      const row = result.rows.find((entry) => entry.userId === userId);
      expect(row, `sem linha no quadro (userId ${userId})`).toBeDefined();
      const perPerson = await stats.countTasksCompletedSince(userId, window);
      expect(row?.monthTasks, `lote divergiu da contagem por pessoa (userId ${userId})`).toBe(perPerson);
      expect(perPerson).toBeGreaterThan(0);
    }
  });

  it("a régua desempata por tarefa do mês, XP e userId — com dado do banco", async () => {
    const result = await gamification.listMonthlyRanking({ now: NOW });
    const positions = new Map(result.rows.map((row) => [row.userId, row.position]))

    // Ana (50 pts, 1 tarefa) perde do trio que tem 50 pts: Bruno e Carla têm 2 tarefas do mês.
    expect(positions.get(brunoId)!).toBeLessThan(positions.get(anaId)!);
    expect(positions.get(carlaId)!).toBeLessThan(positions.get(anaId)!);
    // Tudo igual entre Bruno e Carla: a ordem total fecha pelo userId crescente.
    expect(brunoId).toBeLessThan(carlaId);
    expect(positions.get(brunoId)!).toBeLessThan(positions.get(carlaId)!);
    // Dani tem 900 XP e 1 tarefa, mas 10 pontos: XP e tarefa não resgatam placar menor.
    expect(positions.get(anaId)!).toBeLessThan(positions.get(daniId)!);
  });

  it("o elo do quadro vem do XP, não da coluna `users.elo`", async () => {
    const result = await gamification.listMonthlyRanking({ now: NOW });
    const ana = result.rows.find((row) => row.userId === anaId);
    const stored = await prisma.users.findUniqueOrThrow({ where: { id: anaId }, select: { elo: true, xp: true } });

    expect(stored.elo).toBe("DIAMANTE");
    expect(stored.xp).toBe(0);
    expect(ana?.elo).toBe("BRONZE");
  });

  it("troféus equipados e total saem de `user_badges`, e a moeda passa intacta", async () => {
    const result = await gamification.listMonthlyRanking({ now: NOW });
    const ana = result.rows.find((row) => row.userId === anaId);
    const dani = result.rows.find((row) => row.userId === daniId);

    expect(ana?.trophiesTotal).toBe(2);
    expect(ana?.trophiesEquipped).toBe(1);
    expect(dani?.trophiesTotal).toBe(0);
    expect(dani?.trophiesEquipped).toBe(0);
    expect(ana?.coins).toBe(7);
    expect(dani?.coins).toBe(1);
  });

  it("a tarefa pública atribuída conta uma vez, e o corte de 1º/jun (SP) está fora de maio", async () => {
    const window = monthWindow(MONTH_OF_THE_RUN);
    // Uma a mais na família 2 faria Dani ter 2; o filtro de visibilidade é o que impede.
    expect(await stats.countTasksCompletedSince(daniId, window)).toBe(1);
  });
});
