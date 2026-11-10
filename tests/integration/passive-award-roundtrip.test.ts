// @vitest-environment node
/**
 * plan-v15 S05 (R10/R12) — roundtrip G4 do prêmio com passiva equipada, contra o banco de
 * teste isolado 5433 (nunca 5432).
 *
 * O que este arquivo prova: a escrita do prêmio de tarefa lê as passivas EQUIPADAS de
 * verdade — `equipped = true` com `effect` não nulo entram na soma; desequipada e badge
 * sem passiva ficam fora. O saldo da pessoa sai multiplicado, e a segunda passada do
 * mesmo `taskId` não escreve (R11).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { createGamificationModule } from "@/backend/modules/gamification";

const gamification = createGamificationModule();
const stamp = Date.now();
const taskId = 2500000 + (stamp % 1000000);
const awardDescription = `GAMIFICATION:TASK_COMPLETED:${taskId}`;

let userId = 0;
let badgeIds: number[] = [];

describe("G4 roundtrip — prêmio de tarefa com passiva equipada (isolated test DB)", () => {
  beforeAll(async () => {
    const user = await prisma.users.create({
      data: {
        name: `S05 Rui ${stamp}`,
        email: `s05-passive-rui-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
        weekHours: 10,
      },
      select: { id: true },
    });
    userId = user.id;

    const badgeA = await prisma.badges.create({
      data: { name: `S05 A ${stamp}`, description: "d", category: "achievement", slug: `s05-a-${stamp}`, effect: { kind: "bonus", pct: 0.1 }, isActive: true, createdBy: userId },
      select: { id: true },
    });
    const badgeB = await prisma.badges.create({
      data: { name: `S05 B ${stamp}`, description: "d", category: "achievement", slug: `s05-b-${stamp}`, effect: { kind: "bonus", pct: 0.5 }, isActive: true, createdBy: userId },
      select: { id: true },
    });
    const badgeC = await prisma.badges.create({
      data: { name: `S05 C ${stamp}`, description: "d", category: "achievement", slug: `s05-c-${stamp}`, effect: { kind: "bonus", pct: 0.3 }, isActive: true, createdBy: userId },
      select: { id: true },
    });
    const badgeD = await prisma.badges.create({
      data: { name: `S05 D ${stamp}`, description: "d", category: "milestone", slug: `s05-d-${stamp}`, effect: Prisma.JsonNull, isActive: true, createdBy: userId },
      select: { id: true },
    });
    badgeIds = [badgeA.id, badgeB.id, badgeC.id, badgeD.id];

    await prisma.user_badges.createMany({
      data: [
        { userId, badgeId: badgeA.id, earnedBy: null, equipped: true },
        { userId, badgeId: badgeB.id, earnedBy: null, equipped: true },
        { userId, badgeId: badgeC.id, earnedBy: null, equipped: false },
        { userId, badgeId: badgeD.id, earnedBy: null, equipped: true },
      ],
    });
  });

  afterAll(async () => {
    await prisma.history.deleteMany({ where: { description: awardDescription, entityId: userId } });
    await prisma.user_badges.deleteMany({ where: { userId } });
    await prisma.badges.deleteMany({ where: { id: { in: badgeIds } } });
    await prisma.users.deleteMany({ where: { id: userId } });
  });

  it("100 pts com +10% e +5% equipados creditam 160 no saldo", async () => {
    const result = await gamification.awardFromTaskCompletion({ userId, taskId, taskPoints: 100 });
    expect(result.pointsAwarded).toBe(160);

    const row = await prisma.users.findUnique({ where: { id: userId }, select: { points: true } });
    expect(row?.points).toBe(160);
  });

  it("a segunda passada do mesmo taskId devolve 0 e o saldo fica intocado (R11)", async () => {
    const second = await gamification.awardFromTaskCompletion({ userId, taskId, taskPoints: 100 });
    expect(second.alreadyAwarded).toBe(true);
    expect(second.pointsAwarded).toBe(0);

    const row = await prisma.users.findUnique({ where: { id: userId }, select: { points: true } });
    expect(row?.points).toBe(160);
  });
});
