// @vitest-environment node
/**
 * plan-v8 V8-4 — G4 roundtrip do fechamento de temporada (DEC-213), só contra o banco de teste
 * isolado em 127.0.0.1:5433 (DEC-10; nunca a 5432 do dono).
 *
 * O que este arquivo prova com Prisma real, pelo caminho inteiro (use case → port → adapter →
 * transação no banco), que nenhum teste de duplo prova:
 *   1. o agregado do ano sai do `month_history` pelo PREFIXO do ano (`seasonMonthPrefix`): três linhas
 *      de 2025 somam 200/6, e as linhas de 2023/2024 do MESMO usuário não entram na conta de 2025;
 *   2. o trio "snapshot + `points = 0` + `xp = 0`" acontece JUNTO numa `$transaction`, e `coins` e
 *      `completedTasks` (vitalícios) continuam com o valor de antes — MODELO §4, lido no banco;
 *   3. `elo` é nulo e `position` é a régua do domínio (pontos → tarefas → XP → userId), com quem tem
 *      só XP entrando no livro com 0/0;
 *   4. idempotência por `(userId, year)`: reexecutar não cria linha, não zera o saldo da temporada em
 *      curso e não concede troféu de novo;
 *   5. o troféu é vitalício e a concessão é por ANO: quem foi campeão em 2023 e em 2025 tem UM
 *      `user_badges` e DUAS linhas de auditoria (`GAMIFICATION:SEASON_CHAMPION:<ano>:<pessoa>`); o
 *      campeão de 2024 é outra pessoa e recebe o primeiro troféu dela;
 *   6. suspenso com atividade no ano entra no livro (audiência ampla, como no mensal).
 *
 * Os anos fechados são 2023, 2024 e 2025, fechados em ordem cronológica, longe do ano corrente: a run
 * nunca fecha dado vivo da instância de teste. O XP de cada temporada é escrito antes de cada run
 * (a coluna é uma só e a virada a zera — escrever antes de cada fechamento é como um ano real acumula
 * o XP do próprio ano). As linhas de `month_history` entram direto no banco: quem calcula o somatório é
 * o adaptador, e congelar o cálculo aqui é o que o roundtrip é para fazer. Cleanup em afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_GAMIFICATION_TRACK, SEASON_CHAMPION_BADGE_NAME } from "@/backend/domain";
import { systemActor } from "@/backend/domain/identity";
import { createGamificationModule } from "@/backend/modules/gamification";
import { prisma } from "@/lib/database/prisma";

const gamification = createGamificationModule();

const RUN_2023 = new Date("2024-01-01T03:05:00.000Z"); // 00:05 de 01/01/2024 SP → fecha 2023
const RUN_2024 = new Date("2025-01-01T03:05:00.000Z"); // fecha 2024
const RUN_2025 = new Date("2026-01-01T03:05:00.000Z"); // fecha 2025
const RUN_2025_REPETIDA = new Date("2026-03-14T15:00:00.000Z"); // ainda fecha 2025

const stamp = Date.now();

let anaId = 0;
let brunoId = 0;
let carlaId = 0;
let daniId = 0;
let championBadgeId = 0;
const createdUserIds: number[] = [];
const createdMonthRowIds: number[] = [];

const YEARS = [2023, 2024, 2025];

describe("G4 roundtrip — fechamento de temporada (isolated test DB, 5433)", () => {
  beforeAll(async () => {
    const championBadge = await prisma.badges.findFirst({
      where: { name: SEASON_CHAMPION_BADGE_NAME },
      select: { id: true, criteria: true },
    });
    if (!championBadge) {
      throw new Error(
        `o catálogo da 5433 não tem o troféu ${SEASON_CHAMPION_BADGE_NAME} — aplique a data migration ` +
          "prisma/data-migrations/v8-4-badge-campeao.sql na 5433 antes de rodar este roundtrip",
      );
    }
    championBadgeId = championBadge.id;
    // O troféu entra no catálogo com critério NULO de propósito (ver o SQL): critério com
    // specialCondition nova caía no QUIRK-6C e o motor de avaliação concedia o CAMPEÃO a todo mundo.
    expect(championBadge.criteria).toBeNull();

    const seeds = [
      { name: "Ana Temporada", email: "temporada-ana", status: "active" as const, coins: 500, completedTasks: 42 },
      { name: "Bruno Temporada", email: "temporada-bruno", status: "active" as const, coins: 20, completedTasks: 30 },
      { name: "Carla XP", email: "temporada-carla", status: "active" as const, coins: 7, completedTasks: 4 },
      { name: "Dani Suspensa", email: "temporada-dani", status: "suspended" as const, coins: 3, completedTasks: 9 },
    ];

    for (const seed of seeds) {
      const created = await prisma.users.create({
        data: {
          name: `V8-4 ${seed.name} ${stamp}`,
          email: `v8-4-${seed.email}-${stamp}@test.local`,
          password: "g4-dummy-hash",
          status: seed.status,
          roles: ["VOLUNTARIO"],
          points: 15,
          coins: seed.coins,
          completedTasks: seed.completedTasks,
        },
        select: { id: true },
      });
      createdUserIds.push(created.id);
      if (seed.name === "Ana Temporada") anaId = created.id;
      if (seed.name === "Bruno Temporada") brunoId = created.id;
      if (seed.name === "Carla XP") carlaId = created.id;
      if (seed.name === "Dani Suspensa") daniId = created.id;
    }

    const months = [
      // 2023 — Ana campeã, Bruno segundo.
      { userId: anaId, month: "2023-02", points: 50, completedTasks: 2 },
      { userId: brunoId, month: "2023-05", points: 10, completedTasks: 1 },
      // 2024 — Bruno campeão (90 contra 30 de Ana), Carla entra por linha de mês.
      { userId: anaId, month: "2024-03", points: 30, completedTasks: 1 },
      { userId: brunoId, month: "2024-05", points: 90, completedTasks: 6 },
      { userId: carlaId, month: "2024-11", points: 5, completedTasks: 1 },
      // 2025 — Ana campeã de novo (200 somados em três meses), Dani suspensa com atividade no ano.
      { userId: anaId, month: "2025-01", points: 100, completedTasks: 3 },
      { userId: anaId, month: "2025-06", points: 60, completedTasks: 2 },
      { userId: anaId, month: "2025-12", points: 40, completedTasks: 1 },
      { userId: brunoId, month: "2025-01", points: 100, completedTasks: 5 },
      { userId: brunoId, month: "2025-07", points: 60, completedTasks: 4 },
      { userId: daniId, month: "2025-03", points: 20, completedTasks: 1 },
    ];

    for (const month of months) {
      const created = await prisma.month_history.create({ data: month, select: { id: true } });
      createdMonthRowIds.push(created.id);
    }
  });

  afterAll(async () => {
    await prisma.user_badges.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.history.deleteMany({ where: { performedBy: { in: createdUserIds } } });
    await prisma.season_history.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.month_history.deleteMany({ where: { id: { in: createdMonthRowIds } } });
    await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  async function writeXp(userId: number, xp: number) {
    await prisma.users.update({ where: { id: userId }, data: { xp } });
  }

  async function closeSeasonYear(now: Date, xpByUser: Record<number, number>) {
    for (const [userId, xp] of Object.entries(xpByUser)) {
      await writeXp(Number(userId), xp);
    }
    return gamification.closeSeason({ actor: systemActor("SEASON_CLOSE"), now });
  }

  function seasonRow(userId: number, year: number) {
    return prisma.season_history.findFirst({ where: { userId, year } });
  }

  async function columnsOf(userId: number) {
    const row = await prisma.users.findUnique({
      where: { id: userId },
      select: { points: true, xp: true, coins: true, completedTasks: true },
    });
    return [row?.points, row?.xp, row?.coins, row?.completedTasks];
  }

  it("o agregado do ano sai do month_history pelo prefixo do ano, e o livro nasce com posição e elo nulo", async () => {
    const result = await closeSeasonYear(RUN_2023, { [anaId]: 80, [brunoId]: 40, [carlaId]: 0, [daniId]: 0 });

    expect(result.year).toBe(2023);

    // Ana: só a linha de 2023 entra na conta (as de 2024 e 2025 são de outro ano).
    const ana = await seasonRow(anaId, 2023);
    expect(ana).toMatchObject({ year: 2023, points: 50, completedTasks: 2, xp: 80, elo: null, position: 1 });

    const bruno = await seasonRow(brunoId, 2023);
    expect(bruno).toMatchObject({ points: 10, completedTasks: 1, xp: 40, elo: null, position: 2 });

    // Carla não tem linha de 2023 nem XP: fica fora do livro (sem linha de zeros). Dani idem.
    expect(await seasonRow(carlaId, 2023)).toBeNull();
    expect(await seasonRow(daniId, 2023)).toBeNull();
    expect(result.outcomes.filter((o) => o.status === "without-activity").map((o) => o.userId)).toEqual(
      expect.arrayContaining([carlaId, daniId]),
    );

    // Zeragem seletiva nas duas trilhas da temporada; moeda e contador vitalício intactos.
    expect(await columnsOf(anaId)).toEqual([0, 0, 500, 42]);
    expect(await columnsOf(brunoId)).toEqual([0, 0, 20, 30]);
    // Quem não entrou no livro não é zerado: a coluna da pessoa não foi tocada pela virada.
    expect(await columnsOf(carlaId)).toEqual([15, 0, 7, 4]);
  });

  it("o campeão do ano recebe o troféu e a linha de auditoria do ANO, sem declarar trilha", async () => {
    const lines = await prisma.history.findMany({
      where: { action: "SEASON_CHAMPION", entityId: anaId },
      orderBy: { id: "asc" },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      entityType: "USER",
      entityId: anaId,
      performedBy: anaId,
      description: `GAMIFICATION:SEASON_CHAMPION:2023:${anaId}`,
    });
    // Troféu não é saldo: a linha fica com o default da coluna (a guarda das trilhas diz que
    // POINTS | COINS | XP são as trilhas de saldo, e troféu é `user_badges`).
    expect(lines[0].track).toBe(DEFAULT_GAMIFICATION_TRACK);

    const badges = await prisma.user_badges.findMany({ where: { userId: anaId, badgeId: championBadgeId } });
    expect(badges).toHaveLength(1);
    // Ninguém acorda equipado (DEC-219): a pessoa escolhe o que entra no slot.
    expect(badges[0]?.equipped).toBe(false);
    expect(badges[0]?.earnedBy).toBeNull();
  });

  it("2024 fecha com outro campeão e o primeiro troféu dele", async () => {
    const result = await closeSeasonYear(RUN_2024, { [anaId]: 100, [brunoId]: 300, [carlaId]: 15, [daniId]: 0 });
    expect(result.year).toBe(2024);

    expect(result.champion).toMatchObject({ userId: brunoId, points: 90, status: "awarded", badgeId: championBadgeId });

    const carla = await seasonRow(carlaId, 2024);
    expect(carla).toMatchObject({ points: 5, completedTasks: 1, xp: 15, position: 3 });
    expect(await columnsOf(carlaId)).toEqual([0, 0, 7, 4]);

    const brunoBadges = await prisma.user_badges.findMany({ where: { userId: brunoId, badgeId: championBadgeId } });
    expect(brunoBadges).toHaveLength(1);
  });

  it("2025 soma três meses, inclui suspenso com atividade e quem só tem XP, e revalida o troféu vitalício", async () => {
    const result = await closeSeasonYear(RUN_2025, { [anaId]: 240, [brunoId]: 120, [carlaId]: 30, [daniId]: 0 });
    expect(result.year).toBe(2025);

    const ana = await seasonRow(anaId, 2025);
    // 100 + 60 + 40 somados pelas três linhas de 2025 (as linhas de 2023/2024 ficam fora).
    expect(ana).toMatchObject({ points: 200, completedTasks: 6, xp: 240, elo: null, position: 1 });

    const bruno = await seasonRow(brunoId, 2025);
    expect(bruno).toMatchObject({ points: 160, completedTasks: 9, xp: 120, position: 2 });

    // Dani está SUSPENSA e tem linha de mês: a audiência é ampla, ela fecha o ano (DEC-55 diz que
    // suspenso continua no sistema, só não pode agir).
    const dani = await seasonRow(daniId, 2025);
    expect(dani).toMatchObject({ points: 20, completedTasks: 1, xp: 0, position: 3 });

    // Carla não tem mês em 2025 e tem XP: entra no livro com 0/0 pela trilha aberta.
    const carla = await seasonRow(carlaId, 2025);
    expect(carla).toMatchObject({ points: 0, completedTasks: 0, xp: 30, position: 4 });

    // Ana outra vez: o troféu é vitalício (unique `(userId, badgeId)`), então a concessão de 2025 é
    // "já conquistado" — com UMA linha de user_badges e DUAS linhas de auditoria, uma por ano.
    expect(result.champion).toMatchObject({ userId: anaId, points: 200, status: "already-awarded", badgeId: championBadgeId });
    expect(await prisma.user_badges.count({ where: { userId: anaId, badgeId: championBadgeId } })).toBe(1);
    expect(await prisma.history.count({ where: { action: "SEASON_CHAMPION", entityId: anaId } })).toBe(2);
    expect(await prisma.user_badges.count({ where: { badgeId: championBadgeId, userId: { in: createdUserIds } } })).toBe(2);
  });

  it("reexecutar 2025 não duplica linha, não zera a temporada em curso e não concede o troféu de novo", async () => {
    // O que a pessoa ganhou depois da virada, na temporada em curso.
    await prisma.users.update({ where: { id: anaId }, data: { points: 70, xp: 30 } });

    const segunda = await closeSeasonYear(RUN_2025_REPETIDA, {});
    expect(segunda.year).toBe(2025);

    const outcome = segunda.outcomes.find((o) => o.userId === anaId);
    expect(outcome).toMatchObject({ status: "already-closed", points: 200, completedTasks: 6, xp: 240, position: 1 });
    expect(segunda.closed).toBe(0);

    expect(await prisma.season_history.count({ where: { userId: anaId, year: 2025 } })).toBe(1);
    // A zeragem não veio atrás de um dedup não lido: o saldo da temporada em curso está intacto.
    expect(await columnsOf(anaId)).toEqual([70, 30, 500, 42]);

    expect(segunda.champion).toMatchObject({ userId: anaId, status: "already-awarded" });
    expect(await prisma.history.count({ where: { action: "SEASON_CHAMPION", entityId: anaId } })).toBe(2);
  });

  it("o livro de um ano não vira livro de outro: cada ano tem suas próprias linhas", async () => {
    const porAno = await prisma.season_history.groupBy({
      by: ["year"],
      where: { userId: { in: createdUserIds } },
      _count: { _all: true },
    });
    const counts = new Map(porAno.map((row) => [row.year, row._count._all]));
    expect([...counts.entries()].sort()).toEqual([
      [2023, 2],
      [2024, 3],
      [2025, 4],
    ]);
  });
});
