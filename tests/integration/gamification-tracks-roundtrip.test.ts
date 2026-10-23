// @vitest-environment node
/**
 * plan-v8 V8-1 — G4 roundtrip das trilhas novas (DEC-211/212/213/215/216), só contra o banco de
 * teste isolado em 127.0.0.1:5433 (DEC-10; nunca a 5432 do dono).
 *
 * O que este arquivo prova com Prisma real, sem duplo:
 *   1. `users.coins` e `users.xp` existem, com default 0, e são independentes de `points`
 *      (a coluna continua e passa a ser o placar do mês — o triple-role acabou).
 *   2. A virada 1:1 da DEC-216 funciona sobre dado sintético: o arquivo
 *      `prisma/data-migrations/v8-1-virada-1-1.sql` é LIDO e EXECUTADO dentro de uma transação
 *      que é DESFEITA no fim. Provar pelo arquivo (não por SQL copiado aqui) é o que mantém o
 *      teste casado com o passo que o batch V8-CLOSE vai rodar na 5432. Idempotência por
 *      construção: aplicar duas vezes não move nada.
 *   3. O catálogo de troféus ganha `window: "vida"` no critério (DEC-219), sem sobrescrever
 *      janela já escrita e sem tocar critério nulo.
 *   4. `projects.points` NÃO existe mais no banco (DEC-215) — conferido em `information_schema`,
 *      porque o `tsc` só prova o lado do cliente Prisma.
 *   5. `month_history` e `season_history` são travadas pela unique `(userId, month)` /
 *      `(userId, year)`: a deduplicação que o QUIRK-7C do weekly reset não tem (DEC-212) entra
 *      no banco antes de as rotinas das ondas V8-2/V8-4 existirem. O snapshot guarda o negativo.
 *   6. As duas são CASCADE (precedente `weekly_hours_history`): apagar a pessoa apaga os
 *      snapshots e não bloqueia a exclusão — é a premissa que a guarda estrutural
 *      `user-delete-schema-drift.test.ts` assume.
 *   7. O award real declara a trilha: a linha de `history` de um credit de sessão nasce
 *      `track = "POINTS"` (DEC-211). Desde a V8-3 (DEC-214) o mesmo award escreve a SEGUNDA linha,
 *      `track = "XP"`, e o credit de XP (+10 da sessão) cai em `users.xp` na mesma transação. O
 *      prêmio de ponto continua em `users.points`; MOEDA é V8-5.
 *
 * Como nos outros roundtrips: as asserções olham para os IDs criados por este arquivo, nunca
 * para contagens globais. Cleanup em afterAll: `history` (FK `performedBy` RESTRICT), depois os
 * snapshots e badges criados, depois os usuários.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { COINS_GAMIFICATION_TRACK } from "@/backend/domain";
import { prisma } from "@/lib/database/prisma";
import { createGamificationModule } from "@/backend/modules/gamification";

const gamification = createGamificationModule();

const REPO_ROOT = path.resolve(__dirname, "../..");
const VIRADA_SQL_PATH = path.join(REPO_ROOT, "prisma", "data-migrations", "v8-1-virada-1-1.sql");

/** Mensagem-sentinela: é o que desfaz a transação de prova. */
const ROLLBACK_PROVA = "rollback de prova: a data migration roda em transação desfeita";

const stamp = Date.now();
const WORK_SESSION_ID = 950000 + (stamp % 1000);

let userId = 0;
let viradaUserId = 0;
let cascadeUserId = 0;
let awardUserId = 0;
let badgeId = 0;

const createdUserIds: number[] = [];

/** Extrai as declarações do arquivo de data migration (descartando os comentários). */
function statementsFromSqlFile(filePath: string): string[] {
  return readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/**
 * Roda a data migration da virada numa transação que é DESFEITA, devolvendo o que o `observe`
 * mediu lá dentro. As asserções ficam FORA da transação de propósito: se uma query do meio
 * quebrar, o erro que chega é o dela, e não o sentinela.
 */
async function viradaEmTransacaoDesfeita<T>(observe: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const statements = statementsFromSqlFile(VIRADA_SQL_PATH);
  let observed: T | undefined;
  await expect(
    prisma.$transaction(async (tx) => {
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }
      observed = await observe(tx);
      throw new Error(ROLLBACK_PROVA);
    }),
  ).rejects.toThrow(ROLLBACK_PROVA);
  if (observed === undefined) throw new Error("a transação de prova não devolveu observação");
  return observed;
}

describe("G4 roundtrip — trilhas da gamificação (isolated test DB, 5433)", () => {
  beforeAll(async () => {
    for (const name of ["Ana", "Virada", "Cascade", "Award"]) {
      const created = await prisma.users.create({
        data: {
          name: `V8-1 ${name} ${stamp}`,
          email: `v8-1-trilhas-${name.toLowerCase()}-${stamp}@test.local`,
          password: "g4-dummy-hash",
          status: "active",
          roles: ["VOLUNTARIO"],
        },
        select: { id: true },
      });
      createdUserIds.push(created.id);
      if (name === "Ana") userId = created.id;
      if (name === "Virada") viradaUserId = created.id;
      if (name === "Cascade") cascadeUserId = created.id;
      if (name === "Award") awardUserId = created.id;
    }

    const badge = await prisma.badges.create({
      data: {
        name: `V8-1 Troféu ${stamp}`,
        description: "critério sem janela — é o caso da migration do catálogo",
        category: "milestone",
        criteria: { points: 40 },
        createdBy: userId,
      },
      select: { id: true },
    });
    badgeId = badge.id;
  });

  afterAll(async () => {
    await prisma.history.deleteMany({
      where: {
        OR: [{ performedBy: { in: createdUserIds } }, { entityId: { in: createdUserIds }, entityType: "USER" }],
      },
    });
    await prisma.month_history.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.season_history.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.badges.deleteMany({ where: { createdBy: { in: createdUserIds } } });
    // `cascadeUserId` pode já não existir (o teste do Cascade apaga); `deleteMany` é idempotente.
    await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  it("users.coins e users.xp existem com default 0 e são independentes de points (DEC-211/216)", async () => {
    const born = await prisma.users.findUnique({
      where: { id: userId },
      select: { points: true, coins: true, xp: true },
    });
    expect(born).toEqual({ points: 0, coins: 0, xp: 0 });

    await prisma.users.update({ where: { id: userId }, data: { coins: 750, xp: 300 } });
    const after = await prisma.users.findUnique({
      where: { id: userId },
      select: { points: true, coins: true, xp: true },
    });
    // Mexer nas outras duas trilhas não move o placar mensal.
    expect(after).toEqual({ points: 0, coins: 750, xp: 300 });
  });

  it("a virada 1:1 (DEC-216) sobre dado sintético entrega moeda e zera o placar, e é idempotente", async () => {
    await prisma.users.update({ where: { id: viradaUserId }, data: { points: 417, coins: 0 } });

    const seen = await viradaEmTransacaoDesfeita(async (tx) => {
      const depoisDaPrimeira = await tx.users.findUnique({
        where: { id: viradaUserId },
        select: { points: true, coins: true },
      });
      // Segunda aplicação da MESMA data migration: `coins + 0` — nada se move.
      for (const statement of statementsFromSqlFile(VIRADA_SQL_PATH)) {
        await tx.$executeRawUnsafe(statement);
      }
      const depoisDaSegunda = await tx.users.findUnique({
        where: { id: viradaUserId },
        select: { points: true, coins: true },
      });
      return { depoisDaPrimeira, depoisDaSegunda };
    });

    expect(seen.depoisDaPrimeira).toEqual({ points: 0, coins: 417 });
    expect(seen.depoisDaSegunda).toEqual({ points: 0, coins: 417 });

    // O rollback é de verdade: fora da transação o mundo está como estava.
    const row = await prisma.users.findUnique({ where: { id: viradaUserId }, select: { points: true, coins: true } });
    expect(row).toEqual({ points: 417, coins: 0 });
  });

  it("o catálogo migra com janela `vida` sem sobrescrever janela existente nem tocar critério nulo (DEC-219)", async () => {
    const withWindow = await prisma.badges.create({
      data: {
        name: `V8-1 Já com janela ${stamp}`,
        description: "critério que já declara janela",
        category: "achievement",
        criteria: { tasks: 10, window: "mes" },
        createdBy: userId,
      },
      select: { id: true },
    });
    const noCriteria = await prisma.badges.create({
      data: {
        name: `V8-1 Sem critério ${stamp}`,
        description: "sem critério — não entra na migration",
        category: "special",
        createdBy: userId,
      },
      select: { id: true },
    });

    try {
      const seen = await viradaEmTransacaoDesfeita(async (tx) => ({
        migrado: await tx.badges.findUnique({ where: { id: badgeId }, select: { criteria: true } }),
        preservado: await tx.badges.findUnique({ where: { id: withWindow.id }, select: { criteria: true } }),
        nulo: await tx.badges.findUnique({ where: { id: noCriteria.id }, select: { criteria: true } }),
      }));

      expect(seen.migrado?.criteria).toEqual({ points: 40, window: "vida" });
      expect(seen.preservado?.criteria).toEqual({ tasks: 10, window: "mes" });
      expect(seen.nulo?.criteria).toBeNull();
    } finally {
      await prisma.badges.deleteMany({ where: { id: { in: [withWindow.id, noCriteria.id] } } });
    }

    // Nada do que a transação viu sobreviveu: o badge original continua sem janela.
    const untouched = await prisma.badges.findUnique({ where: { id: badgeId }, select: { criteria: true } });
    expect(untouched?.criteria).toEqual({ points: 40 });
  });

  it("projects.points saiu do banco (DEC-215)", async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'projects' AND column_name = 'points'
    `;
    expect(columns).toEqual([]);
  });

  it("month_history é travada por (userId, month) — a deduplicação do reset mensal (DEC-212)", async () => {
    await prisma.month_history.create({ data: { userId, month: "2099-01", points: -37, completedTasks: 2 } });

    await expect(
      prisma.month_history.create({ data: { userId, month: "2099-01", points: 120, completedTasks: 9 } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    // O snapshot guarda o negativo (o mês perdoa, o histórico não apaga); o mês seguinte é outra linha.
    await prisma.month_history.create({ data: { userId, month: "2099-02", points: 120, completedTasks: 9 } });
    const rows = await prisma.month_history.findMany({ where: { userId }, orderBy: { month: "asc" } });
    expect(rows.map((row) => [row.month, row.points, row.completedTasks])).toEqual([
      ["2099-01", -37, 2],
      ["2099-02", 120, 9],
    ]);
  });

  it("season_history é travada por (userId, year) e guarda o livro-caixa da temporada (DEC-213)", async () => {
    await prisma.season_history.create({
      data: { userId, year: 2099, points: 83, completedTasks: 11, xp: 1200, elo: "OURO", position: 1 },
    });

    await expect(prisma.season_history.create({ data: { userId, year: 2099, points: 0 } })).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );

    const row = await prisma.season_history.findFirst({ where: { userId, year: 2099 } });
    expect(row).toMatchObject({ points: 83, completedTasks: 11, xp: 1200, elo: "OURO", position: 1 });
  });

  it("os dois históricos são CASCADE: apagar a pessoa não fica bloqueado e os snapshots somem", async () => {
    await prisma.month_history.create({ data: { userId: cascadeUserId, month: "2099-03", points: 10 } });
    await prisma.season_history.create({ data: { userId: cascadeUserId, year: 2099, points: 10 } });

    // Sem RESTRICT no caminho, o delete acontece — é o que mantém "cadastro de teste" excluível.
    await prisma.users.delete({ where: { id: cascadeUserId } });

    expect(await prisma.month_history.count({ where: { userId: cascadeUserId } })).toBe(0);
    expect(await prisma.season_history.count({ where: { userId: cascadeUserId } })).toBe(0);
  });

  it("o award real declara a trilha POINTS na linha de history (DEC-211)", async () => {
    const result = await gamification.awardFromWorkSession({
      userId: awardUserId,
      workSessionId: WORK_SESSION_ID,
      durationSeconds: 3600,
    });
    expect(result.amountAwarded).toBe(20);
    expect(result.track).toBe("POINTS");

    const historyRow = await prisma.history.findFirst({
      where: {
        action: "GAMIFICATION_AWARD",
        entityId: awardUserId,
        description: `GAMIFICATION:WORK_SESSION_COMPLETED:${WORK_SESSION_ID}`,
      },
      select: { track: true, newValues: true },
    });
    expect(historyRow?.track).toBe("POINTS");
    expect((historyRow?.newValues as { pointsAwarded: number }).pointsAwarded).toBe(20);

    // O prêmio de ponto cai em `users.points` (placar mensal) e o XP do evento na MESMA run, em
    // `users.xp` (V8-3, DEC-214: +10 por sessão). MOEDA (V8-5) tem destino próprio e não foi tocada.
    const user = await prisma.users.findUnique({
      where: { id: awardUserId },
      select: { points: true, coins: true, xp: true },
    });
    expect(user).toEqual({ points: 20, coins: 0, xp: 10 });

    const xpRow = await prisma.history.findFirst({
      where: {
        action: "GAMIFICATION_AWARD",
        entityId: awardUserId,
        description: `GAMIFICATION:XP:WORK_SESSION_COMPLETED:${WORK_SESSION_ID}`,
      },
      select: { track: true, newValues: true },
    });
    expect(xpRow?.track).toBe("XP");
    expect((xpRow?.newValues as { xpAwarded: number }).xpAwarded).toBe(10);
  });

  it("o prêmio de atividade cai na trilha MOEDA e não toca o placar mensal (DEC-215/216)", async () => {
    const activityId = 910000 + (stamp % 1000);
    const before = await prisma.users.findUnique({
      where: { id: awardUserId },
      select: { points: true, coins: true, xp: true },
    });
    expect(before).toEqual({ points: 20, coins: 0, xp: 10 });

    const result = await gamification.awardFromActivityCompletion({
      userId: awardUserId,
      activityId,
      coins: 225,
    });
    expect(result.amountAwarded).toBe(225);
    expect(result.track).toBe(COINS_GAMIFICATION_TRACK);
    expect(result.xpAwarded).toBe(20);

    const after = await prisma.users.findUnique({ where: { id: awardUserId }, select: { points: true, coins: true, xp: true } });
    // As três trilhas têm destinos separados: moeda subiu, placar do mês ficou onde estava, XP da
    // temporada acompanhou o evento (+20 por membro, DEC-214).
    expect(after).toEqual({ points: 20, coins: 225, xp: 30 });

    const coinsRow = await prisma.history.findFirst({
      where: {
        action: "GAMIFICATION_AWARD",
        entityId: awardUserId,
        description: `GAMIFICATION:ACTIVITY_COMPLETED:${activityId}`,
      },
      select: { track: true, newValues: true },
    });
    expect(coinsRow?.track).toBe(COINS_GAMIFICATION_TRACK);
    expect((coinsRow?.newValues as { coinsAwarded: number }).coinsAwarded).toBe(225);

    // A idempotência é a MESMA descrição da fonte: reexecutar a aprovação credita 0 e não move
    // saldo nenhum — nem moeda, nem XP (a chave é ACTIVITY_COMPLETED, não XP).
    const repeat = await gamification.awardFromActivityCompletion({
      userId: awardUserId,
      activityId,
      coins: 225,
    });
    expect(repeat).toMatchObject({ amountAwarded: 0, track: COINS_GAMIFICATION_TRACK, xpAwarded: 0, alreadyAwarded: true });
    expect(await prisma.users.findUnique({ where: { id: awardUserId }, select: { points: true, coins: true, xp: true } })).toEqual(
      { points: 20, coins: 225, xp: 30 },
    );
  });
});
