// @vitest-environment node
/**
 * plan-v20 S01 (DEC-252, DEC-253, DEC-254; INV3) — o fechamento da temporada contra o banco de
 * teste isolado (127.0.0.1:5433; nunca 5432).
 *
 * Wiring real: `createGamificationModule()` sobre os adaptadores Prisma, sem duplo. É aqui que
 * a constraint composta `(month, track)` com o `month` sendo o ANO, o `$transaction` com os dois
 * zeros e o `onDelete: Cascade` de `month_history.userId` existem de verdade; nenhum teste de
 * dupla exercita nada disso.
 *
 * A run é datada em 1 de fevereiro de 2028 para fechar a temporada 2027 — um ano que o cron
 * desta instância nunca vai fechar. O arquivo limpa as próprias linhas no `beforeAll` e no
 * `afterAll`, para rodar mais de uma vez sem herdar o fechamento da corrida anterior.
 *
 * O que este arquivo não provaria com um duplo:
 *  - o número da linha é o SALDO (`users.points`) no instante, e o zerado alcança a base inteira;
 *  - os DOIS zeros (saldo e placar do mês) no mesmo commit que as linhas (INV3);
 *  - a constraint `(month="2027", track="SEASON_POINTS")` e `(userId, month, track)` fazendo a
 *    segunda run não escrever e não zerar de novo;
 *  - a linha de temporada e a linha de mês coexistindo na MESMA coleção sem se verem.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/database/prisma";
import { createGamificationModule } from "@/backend/modules/gamification";
import { systemActor, userActor } from "@/backend/domain";
import { createPrismaBoardMonthClosePort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-board-month-close.port";

const gamification = createGamificationModule();

const RUN_INSTANT = new Date("2028-02-01T03:00:00.000Z"); // 00:00 de 1 de fevereiro, Sao Paulo
const TARGET_YEAR = "2027";
const SEASON_TRACK = "SEASON_POINTS";

const stamp = Date.now();
const ids: number[] = [];

async function pointsOf(userId: number): Promise<number> {
  const row = await prisma.users.findUnique({
    where: { id: userId },
    select: { points: true, currentMonthPoints: true },
  });
  return row?.points ?? -1;
}

async function monthPointsOf(userId: number): Promise<number> {
  const row = await prisma.users.findUnique({
    where: { id: userId },
    select: { currentMonthPoints: true },
  });
  return row?.currentMonthPoints ?? -1;
}

async function seasonRowsFor(userId: number) {
  return prisma.month_history.findMany({
    where: { userId, month: TARGET_YEAR, track: SEASON_TRACK },
    select: { userId: true, value: true, position: true, userName: true },
  });
}

describe("G4 roundtrip — fechamento da temporada (isolated test DB)", () => {
  beforeAll(async () => {
    // Deixa o ano da corrida anterior para trás, se alguma corrida caiu no meio.
    await prisma.month_history.deleteMany({ where: { month: TARGET_YEAR, track: SEASON_TRACK } });
    await prisma.board_month_closes.deleteMany({ where: { month: TARGET_YEAR, track: SEASON_TRACK } });

    for (const name of ["Alta", "Zero", "Suspensa", "Negativa"]) {
      const created = await prisma.users.create({
        data: {
          name: `V20 Temp ${name} ${stamp}`,
          email: `v20-temp-${stamp}-${name.replace(/\s+/g, "-").toLowerCase()}@test.local`,
          password: "g4-dummy-hash",
          status: "active",
          roles: ["VOLUNTARIO"],
        },
        select: { id: true },
      });
      ids.push(created.id);
    }
    const [alta, zero, suspensa, negativa] = ids;

    // O saldo entra pelo caminho real de prêmio, não por UPDATE de teste.
    await gamification.awardFromTaskCompletion({ userId: alta, taskId: 981000 + (stamp % 1000), taskPoints: 30 });
    await gamification.awardFromTaskCompletion({ userId: suspensa, taskId: 982000 + (stamp % 1000), taskPoints: 50 });
    await prisma.users.update({ where: { id: suspensa }, data: { status: "suspended" } });
    await prisma.users.update({ where: { id: negativa }, data: { points: -40, currentMonthPoints: -40 } });
    // O placar do mês existe para provar que o zerado da temporada alcança as duas colunas.
    await prisma.users.update({ where: { id: alta }, data: { currentMonthPoints: 11 } });
  });

  afterAll(async () => {
    await prisma.month_history.deleteMany({ where: { userId: { in: ids } } });
    await prisma.history.deleteMany({ where: { performedBy: { in: ids } } });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
    await prisma.board_month_closes.deleteMany({ where: { month: TARGET_YEAR, track: SEASON_TRACK } });
    await prisma.board_month_closes.deleteMany({ where: { month: "2027-06", track: "MONTH_POINTS" } });
  });

  it("a run fecha a temporada 2027 com o saldo congelado em linha por pessoa ativa (CA1 de DEC-253)", async () => {
    const [alta, zero, suspensa, negativa] = ids;

    const result = await gamification.closeSeason({
      actor: systemActor("SEASON_CLOSE"),
      now: RUN_INSTANT,
    });

    expect(result.closed).toBe(true);
    expect(result.alreadyClosed).toBe(false);
    expect(result.year).toBe(TARGET_YEAR);
    expect(result.track).toBe(SEASON_TRACK);
    expect(result.periodStart).toBe("2027-01-01T03:00:00.000Z");
    expect(result.periodEnd).toBe("2028-01-01T02:59:59.999Z");
    expect(result.triggeredBy).toBe("SYSTEM:SEASON_CLOSE");

    // Só ativa recebe linha; negativa entra ativa com saldo negativo, suspensa fica fora. A base
    // do banco de teste tem gente do seed, como no roundtrip de mês — a contagem é >= e as
    // linhas dos criados são conferidas uma a uma.
    expect(result.peopleCount).toBeGreaterThanOrEqual(3);
    expect(result.excluded).toEqual(expect.arrayContaining([{ userId: suspensa, status: "suspended" }]));

    const rows = await prisma.month_history.findMany({
      where: { month: TARGET_YEAR, track: SEASON_TRACK, userId: { in: ids } },
      orderBy: { position: "asc" },
      select: { userId: true, value: true, position: true, userName: true },
    });
    const byUser = new Map(rows.map((r) => [r.userId, r]));
    expect(byUser.get(alta)?.value).toBe(30);
    expect(byUser.get(negativa)?.value).toBe(-40); // DEC-39: negativo congela como está
    expect(byUser.has(zero)).toBe(true);
    // A base do banco de teste tem gente do seed com saldo, então a posição GLOBAL não é a dos
    // criados. O que se congela é a ordem RELATIVA dos três criados, decidida pela régua do
    // domínio (valor decrescente, depois nome em ordem de código, depois id): 30 > 0 > -40.
    const posAlta = byUser.get(alta)!.position;
    const posZero = byUser.get(zero)!.position;
    const posNegativa = byUser.get(negativa)!.position;
    expect(new Set([posAlta, posZero, posNegativa]).size).toBe(3);
    expect(posAlta).toBeLessThan(posZero);
    expect(posZero).toBeLessThan(posNegativa);
    expect(byUser.get(alta)!.userName).toBe(`V20 Temp Alta ${stamp}`);
  });

  it("os dois zeros caem no mesmo commit: saldo E placar do mês zerados para toda a base (INV3, DEC-253)", async () => {
    const [alta, zero, suspensa, negativa] = ids;

    expect(await pointsOf(alta)).toBe(0);
    expect(await pointsOf(negativa)).toBe(0);
    expect(await monthPointsOf(alta)).toBe(0);
    // A suspensa não recebeu linha e mesmo assim foi zerada — o zerado alcança a base.
    expect(await pointsOf(suspensa)).toBe(0);
    expect(await monthPointsOf(suspensa)).toBe(0);
  });

  it("run repetida não escreve linha, não zera de novo e nomeia o ano na recusa (idempotência, DEC-254)", async () => {
    const [alta] = ids;

    // Prêmio creditado depois do fechamento é do ciclo novo e não pode sumir.
    await gamification.awardFromTaskCompletion({ userId: alta, taskId: 983000 + (stamp % 1000), taskPoints: 25 });
    expect(await pointsOf(alta)).toBe(25);

    const repeat = await gamification.closeSeason({
      actor: userActor(alta, ["COORDENADOR"]),
      now: new Date("2028-02-15T15:00:00.000Z"),
    });

    expect(repeat.closed).toBe(false);
    expect(repeat.alreadyClosed).toBe(true);
    expect(repeat.year).toBe(TARGET_YEAR);
    expect(repeat.peopleCount).toBe(0);

    expect(await pointsOf(alta)).toBe(25); // nao zerou de novo
    const rows = await prisma.month_history.findMany({
      where: { userId: { in: ids }, month: TARGET_YEAR, track: SEASON_TRACK },
      select: { userId: true, value: true },
    });
    expect(rows).toHaveLength(3); // nenhuma linha nova para os criados
    expect(rows.find((row) => row.userId === ids[0])?.value).toBe(30); // o valor fechado não mudou
  });

  it("temporada e mês coexistem na MESMA coleção sem se verem (DEC-252)", async () => {
    const [alta] = ids;

    // Uma linha de mês para a mesma pessoa, no mesmo banco, trilha MONTH_POINTS — com header
    // proprio, pelo caminho real da coleção.
    const header = await prisma.board_month_closes.create({
      data: {
        month: "2027-06",
        track: "MONTH_POINTS",
        periodStart: new Date("2027-06-01T03:00:00.000Z"),
        periodEnd: new Date("2027-07-01T02:59:59.999Z"),
        closedAt: new Date("2027-07-01T03:00:00.000Z"),
        triggeredBy: "SYSTEM:MONTH_CLOSE",
        peopleCount: 1,
      },
      select: { id: true },
    });
    await prisma.month_history.create({
      data: {
        closeId: header.id,
        userId: alta,
        userName: `V20 Temp Alta ${stamp}`,
        month: "2027-06",
        track: "MONTH_POINTS",
        value: 11,
        position: 1,
        periodStart: new Date("2027-06-01T03:00:00.000Z"),
        periodEnd: new Date("2027-07-01T02:59:59.999Z"),
        closedAt: new Date("2027-07-01T03:00:00.000Z"),
      },
    });

    const season = await prisma.month_history.findMany({
      where: { userId: alta, track: SEASON_TRACK },
      select: { month: true, value: true },
    });
    const months = await prisma.month_history.findMany({
      where: { userId: alta, track: "MONTH_POINTS" },
      select: { month: true, value: true },
    });
    expect(season.map((r) => r.month)).toEqual([TARGET_YEAR]);
    expect(months.map((r) => r.month)).toEqual(["2027-06"]);
  });

  it("a escrita de uma temporada já fechada bate na constraint composta e nomeia o ano (DEC-254)", async () => {
    // O use case já devolve `alreadyClosed` antes de escrever; o que o adaptador real prova é o
    // caminho de concorrência: duas runs que passam pela checagem juntas, a segunda bate em
    // P2002 aqui dentro e sai como ConflictError nomeando A TEMPORADA — não a frase do mês.
    const adapter = createPrismaBoardMonthClosePort();
    await expect(
      adapter.writeClose({
        month: TARGET_YEAR,
        track: SEASON_TRACK,
        periodStart: new Date("2027-01-01T03:00:00.000Z"),
        periodEnd: new Date("2028-01-01T02:59:59.999Z"),
        closedAt: new Date("2028-02-01T03:00:00.000Z"),
        triggeredBy: "SYSTEM:SEASON_CLOSE",
        rows: [],
        userIdsToZero: [],
        zeroFields: ["balance", "monthPoints"],
      }),
    ).rejects.toThrow(/temporada do quadro já foi fechada: 2027/);
  });
});
