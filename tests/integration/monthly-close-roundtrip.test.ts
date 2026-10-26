// @vitest-environment node
/**
 * plan-v9 S02 (MODELO R5, R6, R7, R10, R11; CA1, CA2, CA5, CA6, CA7; ADR-002, ADR-003, DEC-226)
 * — o fechamento de mês contra o banco de teste isolado (127.0.0.1:5433; nunca 5432).
 *
 * Wiring real: `createGamificationModule()` sobre os adaptadores Prisma, sem duplo. É aqui que
 * a constraint composta, o `$transaction` e o cascade existem de verdade; nenhum teste de dupla
 * exercita nada disso.
 *
 * A run é datada em 1 de fevereiro de 2028 para fechar JANEIRO de 2028, um mês que o cron desta
 * instância nunca vai fechar. O arquivo limpa o próprio mês no `beforeAll` e no `afterAll`, para
 * rodar mais de uma vez sem herdar o fechamento da corrida anterior.
 *
 * O que este arquivo não provaria com um duplo:
 *  - a linha por pessoa ativa, inclusive com placar zero, e a ausência para quem está fora de `active`;
 *  - o placar zerado também para quem não recebeu linha;
 *  - a constraint `(userId, month, track)` e o registro de mês, que juntos fazem a segunda run
 *    não escrever linha e não zerar de novo;
 *  - o `onDelete: Cascade` de `month_history.userId`, que é a DEC-225.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/database/prisma";
import { createGamificationModule } from "@/backend/modules/gamification";
import { systemActor, userActor } from "@/backend/domain";

const gamification = createGamificationModule();

const RUN_INSTANT = new Date("2028-02-01T03:00:01.000Z"); // 00:00:01 de 1 de fevereiro, Sao Paulo
const SECOND_RUN = new Date("2028-02-15T15:00:00.000Z"); // gatilho manual fora do dia 1
const TARGET_MONTH = "2028-01";
const TRACK = "MONTH_POINTS";

const stamp = Date.now();
const TASK_A = 960000 + (stamp % 1000);
const TASK_C = 970000 + (stamp % 1000);
const TASK_A2 = 980000 + (stamp % 1000);

const ids: number[] = [];
let closedMonth = "";

async function monthPoints(userId: number): Promise<number> {
  const row = await prisma.users.findUnique({ where: { id: userId }, select: { currentMonthPoints: true } });
  return row?.currentMonthPoints ?? -1;
}

async function rowsFor(userId: number) {
  return prisma.month_history.findMany({
    where: { userId, month: TARGET_MONTH, track: TRACK },
    select: { userId: true, value: true, position: true, userName: true, closedAt: true },
  });
}

describe("G4 roundtrip — fechamento do mês do quadro (isolated test DB)", () => {
  beforeAll(async () => {
    // Deixa o mês da corrida anterior para trás, se alguma corrida caiu no meio.
    await prisma.month_history.deleteMany({ where: { month: TARGET_MONTH } });
    await prisma.board_month_closes.deleteMany({ where: { month: TARGET_MONTH, track: TRACK } });

    for (const name of ["Ativa Alta", "Ativa Zero", "Suspensa", "Ativa Negativa"]) {
      const created = await prisma.users.create({
        data: {
          name: `V9 Fech ${name} ${stamp}`,
          email: `v9-fech-${stamp}-${name.replace(/\s+/g, "-").toLowerCase()}@test.local`,
          password: "g4-dummy-hash",
          status: "active",
          roles: ["VOLUNTARIO"],
        },
        select: { id: true },
      });
      ids.push(created.id);
    }
    const [alta, zero, suspensa, negativa] = ids;

    // O placar entra pelo caminho real de prêmio, não por UPDATE de teste.
    await gamification.awardFromTaskCompletion({ userId: alta, taskId: TASK_A, taskPoints: 30 });
    await gamification.awardFromTaskCompletion({ userId: suspensa, taskId: TASK_C, taskPoints: 50 });
    await prisma.users.update({ where: { id: suspensa }, data: { status: "suspended" } });
    await prisma.users.update({ where: { id: negativa }, data: { currentMonthPoints: -40 } });
  });

  afterAll(async () => {
    await prisma.month_history.deleteMany({ where: { userId: { in: ids } } });
    await prisma.history.deleteMany({ where: { performedBy: { in: ids } } });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
    await prisma.board_month_closes.deleteMany({ where: { month: TARGET_MONTH, track: TRACK } });
  });

  it("o cron fecha janeiro de 2028 e escreve uma linha por pessoa ativa, inclusive com placar zero (CA1)", async () => {
    const [alta, zero, suspensa, negativa] = ids;

    const result = await gamification.closeBoardMonth({ actor: systemActor("MONTH_CLOSE"), now: RUN_INSTANT });
    closedMonth = result.month;

    expect(result.closed).toBe(true);
    expect(result.alreadyClosed).toBe(false);
    expect(result.month).toBe(TARGET_MONTH);
    expect(result.monthLabel).toBe("janeiro de 2028");
    expect(result.track).toBe(TRACK);
    expect(result.periodStart).toBe("2028-01-01T03:00:00.000Z");
    expect(result.periodEnd).toBe("2028-02-01T02:59:59.999Z");
    expect(result.triggeredBy).toBe("SYSTEM:MONTH_CLOSE");

    const rowsAlta = await rowsFor(alta);
    const rowsZero = await rowsFor(zero);
    const rowsNegativa = await rowsFor(negativa);
    const rowsSuspensa = await rowsFor(suspensa);

    expect(rowsAlta).toHaveLength(1);
    expect(rowsZero).toHaveLength(1);
    expect(rowsNegativa).toHaveLength(1);
    // CA7 / R11: quem esta fora de active nao recebe linha.
    expect(rowsSuspensa).toHaveLength(0);

    expect(rowsAlta[0].value).toBe(30);
    expect(rowsZero[0].value).toBe(0); // DEC-226: zero e linha gravada, nao ausencia
    expect(rowsNegativa[0].value).toBe(-40); // CA6 / R10: o negativo e guardado como estava
    expect(rowsAlta[0].userName).toContain("Ativa Alta");

    // Posicao: valor decrescente entre as fixturas, sem buraco relativo.
    expect(rowsAlta[0].position).toBeLessThan(rowsZero[0].position);
    expect(rowsZero[0].position).toBeLessThan(rowsNegativa[0].position);
  });

  it("o placar do mês é zerado de toda pessoa da base, inclusive de quem não recebeu linha (R11)", async () => {
    for (const id of ids) {
      expect(await monthPoints(id)).toBe(0);
    }
  });

  it("o mês fica registrado como fechado, com período civil e quem disparou a run", async () => {
    const header = await prisma.board_month_closes.findFirst({
      where: { month: closedMonth, track: TRACK },
      select: { month: true, track: true, periodStart: true, periodEnd: true, closedAt: true, triggeredBy: true, peopleCount: true },
    });

    expect(header).not.toBeNull();
    expect(header?.periodStart.toISOString()).toBe("2028-01-01T03:00:00.000Z");
    expect(header?.periodEnd.toISOString()).toBe("2028-02-01T02:59:59.999Z");
    expect(header?.closedAt.toISOString()).toBe(RUN_INSTANT.toISOString());
    expect(header?.triggeredBy).toBe("SYSTEM:MONTH_CLOSE");
    expect(header?.peopleCount).toBeGreaterThanOrEqual(3);
  });

  it("run repetida não escreve linha, não zera de novo e não reescreve o valor (CA2, R6)", async () => {
    const [alta] = ids;

    // Premio creditado depois do fechamento pertence ao mes seguinte e nao pode ser zerado pela segunda run.
    await gamification.awardFromTaskCompletion({ userId: alta, taskId: TASK_A2, taskPoints: 25 });
    expect(await monthPoints(alta)).toBe(25);

    const repeat = await gamification.closeBoardMonth({ actor: userActor(alta, ["COORDENADOR"]), now: SECOND_RUN });

    expect(repeat.closed).toBe(false);
    expect(repeat.alreadyClosed).toBe(true);
    expect(repeat.month).toBe(TARGET_MONTH);
    expect(repeat.peopleCount).toBe(0);

    expect(await monthPoints(alta)).toBe(25); // nao zerou de novo
    const rows = await prisma.month_history.findMany({
      where: { userId: { in: ids }, month: TARGET_MONTH, track: TRACK },
      select: { userId: true, value: true },
    });
    expect(rows).toHaveLength(3); // nenhuma linha nova
    expect(rows.find((row) => row.userId === ids[0])?.value).toBe(30); // R7: o valor fechado nao mudou
  });

  it("month_history.userId cascadeia: a linha do mês sai com a conta (ADR-003, DEC-225)", async () => {
    const negativa = ids[3];

    await prisma.users.delete({ where: { id: negativa } });

    expect(await prisma.month_history.count({ where: { userId: negativa } })).toBe(0);
  });
});
