// @vitest-environment node
/**
 * plan-v15 S07 (R13) — roundtrip G4 do placar com passiva, contra o banco de teste isolado
 * 5433 (nunca 5432).
 *
 * O que este arquivo prova: o prêmio escrito com passiva equipada deposita o valor
 * multiplicado em `users.currentMonthPoints`, e o fechamento do mês grava esse valor
 * como está, com a posição na ordem aplicada. Meses de outros usuários não são tocados.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { userActor } from "@/backend/domain";
import { createGamificationModule } from "@/backend/modules/gamification";

const gamification = createGamificationModule();
const stamp = Date.now();
const taskA = 2600000 + (stamp % 1000000);
const taskB = 2600001 + (stamp % 1000000);
const month = "2026-11";
const track = "MONTH_POINTS";

let userIdA = 0;
let userIdB = 0;
let userIdC = 0;
let badgeId = 0;

describe("G4 roundtrip — placar do mês com passiva aplicada (isolated test DB)", () => {
  beforeAll(async () => {
    const a = await prisma.users.create({
      data: { name: `S07 Ana ${stamp}`, email: `s07-ana-${stamp}@test.local`, password: "g4-dummy-hash", status: "active", roles: ["VOLUNTARIO"], weekHours: 10 },
      select: { id: true },
    });
    const b = await prisma.users.create({
      data: { name: `S07 Bruno ${stamp}`, email: `s07-bruno-${stamp}@test.local`, password: "g4-dummy-hash", status: "active", roles: ["VOLUNTARIO"], weekHours: 10 },
      select: { id: true },
    });
    const c = await prisma.users.create({
      data: { name: `S07 Carla ${stamp}`, email: `s07-carla-${stamp}@test.local`, password: "g4-dummy-hash", status: "active", roles: ["COORDENADOR"], weekHours: 10 },
      select: { id: true },
    });
    userIdA = a.id;
    userIdB = b.id;
    userIdC = c.id;

    const badge = await prisma.badges.create({
      data: {
        name: `S07 Passiva ${stamp}`,
        description: "d",
        category: "achievement",
        slug: `s07-close-${stamp}`,
        effect: { kind: "bonus", pct: 0.1 },
        isActive: true,
        createdBy: userIdA,
      },
      select: { id: true },
    });
    badgeId = badge.id;

    await prisma.user_badges.create({ data: { userId: userIdA, badgeId, earnedBy: null, equipped: true } });
  });

  afterAll(async () => {
    await prisma.month_history.deleteMany({ where: { month, track, userId: { in: [userIdA, userIdB, userIdC] } } });
    await prisma.board_month_closes.deleteMany({ where: { month, track } });
    await prisma.history.deleteMany({ where: { description: { in: [`GAMIFICATION:TASK_COMPLETED:${taskA}`, `GAMIFICATION:TASK_COMPLETED:${taskB}`] } } });
    await prisma.user_badges.deleteMany({ where: { userId: userIdA } });
    await prisma.badges.deleteMany({ where: { id: badgeId } });
    await prisma.users.deleteMany({ where: { id: { in: [userIdA, userIdB, userIdC] } } });
  });

  it("o prêmio com passiva deposita o valor multiplicado no placar vivo", async () => {
    const awardA = await gamification.awardFromTaskCompletion({ userId: userIdA, taskId: taskA, taskPoints: 100 });
    expect(awardA.pointsAwarded).toBe(110);

    const awardB = await gamification.awardFromTaskCompletion({ userId: userIdB, taskId: taskB, taskPoints: 100 });
    expect(awardB.pointsAwarded).toBe(100);

    const rows = await prisma.users.findMany({
      where: { id: { in: [userIdA, userIdB] } },
      select: { id: true, currentMonthPoints: true },
    });
    const points = new Map(rows.map((r) => [r.id, r.currentMonthPoints]));
    expect(points.get(userIdA)).toBe(110);
    expect(points.get(userIdB)).toBe(100);
  });

  it("o fechamento grava o valor aplicado e a posição na ordem aplicada", async () => {
    const result = await gamification.closeBoardMonth({
      actor: userActor(userIdC, ["COORDENADOR"]),
      // 03:00Z é a meia-noite civil de 1 de dezembro em America/Sao_Paulo — o mês-alvo é
      // o anterior, 2026-11 (R5). Com 02:00Z o relógio civil ainda é 30 de novembro.
      now: new Date("2026-12-01T03:00:00Z"),
    });
    expect(result.month).toBe(month);

    const lines = await prisma.month_history.findMany({
      where: { month, track, userId: { in: [userIdA, userIdB] } },
      select: { userId: true, value: true, position: true },
    });
    const byUser = new Map(lines.map((l) => [l.userId, l]));
    expect(byUser.get(userIdA)?.value).toBe(110);
    expect(byUser.get(userIdB)?.value).toBe(100);
    expect(byUser.get(userIdA)?.position).toBe(1);
    expect(byUser.get(userIdB)?.position).toBe(2);
  });
});
