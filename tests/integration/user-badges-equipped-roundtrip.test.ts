// @vitest-environment node
/**
 * plan-v15 S04 (R8/R9) — roundtrip G4 do slot equipável contra o banco de teste isolado
 * 5433 (nunca 5432).
 *
 * O que este arquivo prova: as três colunas novas sobrevivem ao roundtripo real —
 * `badges.slug` único, `badges.effect` em JSON, `user_badges.equipped` escrito e lido pela
 * porta. O `slug` repetido é recusado pelo índice único. A leitura do badge na lista do
 * perfil (`findByUserId` com include) traz a passiva para a tela.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createPrismaUserBadgePort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-user-badge.port";

const stamp = Date.now();
const userBadgesPort = createPrismaUserBadgePort();

let userId = 0;
let passiveId = 0;
let plainId = 0;
let extraIds: number[] = [];

describe("G4 roundtrip — slot equipável (isolated test DB)", () => {
  beforeAll(async () => {
    const user = await prisma.users.create({
      data: {
        name: `S04 Eva ${stamp}`,
        email: `s04-equipped-eva-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
        weekHours: 10,
      },
      select: { id: true },
    });
    userId = user.id;

    const passive = await prisma.badges.create({
      data: {
        name: `S04 Passiva ${stamp}`,
        description: "d",
        category: "achievement",
        criteria: { version: 2, clauses: [{ metric: "tasks_completed", op: ">=", value: 5 }] },
        slug: `s04-passive-${stamp}`,
        effect: { kind: "bonus", pct: 0.1 },
        isActive: true,
        createdBy: userId,
      },
      select: { id: true },
    });
    passiveId = passive.id;

    const plain = await prisma.badges.create({
      data: {
        name: `S04 Selo ${stamp}`,
        description: "d",
        category: "milestone",
        slug: `s04-plain-${stamp}`,
        isActive: true,
        createdBy: userId,
      },
      select: { id: true },
    });
    plainId = plain.id;

    await prisma.user_badges.createMany({
      data: [
        { userId, badgeId: passiveId, earnedBy: null },
        { userId, badgeId: plainId, earnedBy: null },
      ],
    });

    const rows = await prisma.user_badges.findMany({ where: { userId }, select: { id: true } });
    extraIds = rows.map((r) => r.id);
  });

  afterAll(async () => {
    await prisma.user_badges.deleteMany({ where: { id: { in: extraIds } } });
    await prisma.badges.deleteMany({ where: { id: { in: [passiveId, plainId] } } });
    await prisma.users.deleteMany({ where: { id: userId } });
  });

  it("equipa pela porta e a leitura devolve equipped com a passiva do badge", async () => {
    const earned = await prisma.user_badges.findUnique({
      where: { userId_badgeId: { userId, badgeId: passiveId } },
      select: { id: true },
    });
    expect(earned).not.toBeNull();

    await userBadgesPort.setEquipped(earned!.id, true);

    const read = await userBadgesPort.findByUserAndBadge(userId, passiveId);
    expect(read?.equipped).toBe(true);
    expect(read?.badge?.effect).toEqual({ kind: "bonus", pct: 0.1 });
    expect(await userBadgesPort.countEquippedByUserId(userId)).toBe(1);

    await userBadgesPort.setEquipped(earned!.id, false);
    expect(await userBadgesPort.countEquippedByUserId(userId)).toBe(0);
  });

  it("a lista do perfil traz o badge com slug e passiva (include da porta)", async () => {
    const list = await userBadgesPort.findByUserId(userId);
    const equippedable = list.find((ub) => ub.badgeId === passiveId);
    expect(equippedable?.badge?.slug).toBe(`s04-passive-${stamp}`);
    expect(equippedable?.badge?.effect).toEqual({ kind: "bonus", pct: 0.1 });
    expect(list.find((ub) => ub.badgeId === plainId)?.badge?.effect).toBeNull();
  });

  it("slug repetido é recusado pelo índice único", async () => {
    await expect(
      prisma.badges.create({
        data: {
          name: `S04 Gêmeo ${stamp}`,
          description: "d",
          category: "special",
          slug: `s04-passive-${stamp}`,
          isActive: true,
          createdBy: userId,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("o default de equipped é false — ninguém começa equipado", async () => {
    const plainRow = await prisma.user_badges.findUnique({
      where: { userId_badgeId: { userId, badgeId: plainId } },
      select: { equipped: true },
    });
    expect(plainRow?.equipped).toBe(false);
  });
});
