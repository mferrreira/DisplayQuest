// @vitest-environment node
/**
 * plan-v9 S01 (ADR-001, R1, R2, CA3) — as duas trilhas num banco de verdade.
 *
 * Roundtrip G4 contra o banco de teste isolado (127.0.0.1:5433 — DEC-10/BLOCKER-02; nunca 5432).
 * Exercita a wiring real: `createGamificationModule()` sobre os adaptadores Prisma, sem duplo.
 *
 * O que tem que ficar verde aqui e não ficaria num teste de dupla:
 *  - o crédito de tarefa incrementa `points` e `currentMonthPoints` pelo mesmo valor;
 *  - a idempotência por descrição não escreve de novo em nenhuma das duas trilhas;
 *  - o placar do mês é coluna da pessoa, derivada como zero quando a pessoa não tem placar.
 *
 * Cleanup em afterAll: `history` (FK `performedBy` -> users, sem cascade) e depois o usuário.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createGamificationModule } from "@/backend/modules/gamification";

const gamification = createGamificationModule();

const stamp = Date.now();
const TASK_ID = 930000 + (stamp % 1000);
const TASK_ID_2 = 940000 + (stamp % 1000);

let userId = 0;

describe("G4 roundtrip — trilha do placar mensal (isolated test DB)", () => {
  beforeAll(async () => {
    const created = await prisma.users.create({
      data: {
        name: `V9 Placar ${stamp}`,
        email: `v9-placar-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });
    userId = created.id;
  });

  afterAll(async () => {
    await prisma.history.deleteMany({ where: { performedBy: userId } });
    await prisma.users.delete({ where: { id: userId } });
  });

  it("a pessoa nasce com placar do mês zero, independente do saldo", async () => {
    const row = await prisma.users.findUnique({
      where: { id: userId },
      select: { points: true, currentMonthPoints: true },
    });
    expect(row?.points).toBe(0);
    expect(row?.currentMonthPoints).toBe(0);
  });

  it("crédito de tarefa move as duas trilhas pelo mesmo valor", async () => {
    const award = await gamification.awardFromTaskCompletion({
      userId,
      taskId: TASK_ID,
      taskPoints: 25,
    });
    expect(award.pointsAwarded).toBe(25);

    const row = await prisma.users.findUnique({
      where: { id: userId },
      select: { points: true, currentMonthPoints: true },
    });
    expect(row?.points).toBe(25);
    expect(row?.currentMonthPoints).toBe(25);
  });

  it("prêmio repetido da mesma tarefa não escreve em nenhuma das trilhas", async () => {
    const repeat = await gamification.awardFromTaskCompletion({
      userId,
      taskId: TASK_ID,
      taskPoints: 25,
    });
    expect(repeat.alreadyAwarded).toBe(true);
    expect(repeat.pointsAwarded).toBe(0);

    const row = await prisma.users.findUnique({
      where: { id: userId },
      select: { points: true, currentMonthPoints: true },
    });
    expect(row?.points).toBe(25);
    expect(row?.currentMonthPoints).toBe(25);
  });

  it("segundo prêmio soma sobre o placar do mês, que continua acompanhando o saldo", async () => {
    await gamification.awardFromTaskCompletion({ userId, taskId: TASK_ID_2 });

    const row = await prisma.users.findUnique({
      where: { id: userId },
      select: { points: true, currentMonthPoints: true },
    });
    expect(row?.points).toBe(35);
    expect(row?.currentMonthPoints).toBe(35);
  });
});
