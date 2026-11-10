/**
 * plan-v16 S01 — roundtrip G4: `iconKey` entra pela escrita do módulo e sai na leitura.
 *
 * Contra o Prisma real (5433): create com chave, lista traz a chave, update troca a chave
 * e update com null apaga a chave. A coluna é a única fonte — o binário do bucket não
 * passa por aqui (INV1).
 */
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/database/prisma";
import { createGamificationModule } from "@/backend/modules/gamification";

const stamp = Date.now();
const gamification = createGamificationModule();
let userId = 0;
const badgeIds: number[] = [];

async function badgeRow(id: number) {
  return prisma.badges.findUnique({ where: { id }, select: { iconKey: true } });
}

beforeAll(async () => {
  const user = await prisma.users.create({
    data: { name: `RT S16 ${stamp}`, email: `rt-s16-${stamp}@example.com`, status: "active", roles: [] },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.badges.deleteMany({ where: { id: { in: badgeIds } } });
  await prisma.users.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("iconKey do badge no Prisma real", () => {
  it("create com chave grava a coluna e a lista devolve a chave", async () => {
    const key = `badges/placeholder/${stamp}.webp`;
    const badge = await gamification.createBadge({
      name: `RT icone ${stamp}`,
      description: "roundtrip S16",
      category: "milestone",
      createdBy: userId,
      actorRoles: ["COORDENADOR"],
      iconKey: key,
    });
    badgeIds.push(badge.id!);
    expect(badge.iconKey).toBe(key);
    expect((await badgeRow(badge.id!))?.iconKey).toBe(key);
    const listed = (await gamification.listBadges()).find((b) => b.id === badge.id);
    expect(listed?.iconKey).toBe(key);
  });

  it("update troca a chave; update com null apaga", async () => {
    const badge = badgeIds[0];
    const nova = `badges/${badge}/novo.webp`;
    const trocada = await gamification.updateBadge({ id: badge, data: { iconKey: nova }, actorRoles: ["COORDENADOR"] });
    expect(trocada.iconKey).toBe(nova);
    expect((await badgeRow(badge))?.iconKey).toBe(nova);

    const apagada = await gamification.updateBadge({ id: badge, data: { iconKey: null }, actorRoles: ["COORDENADOR"] });
    expect(apagada.iconKey).toBeNull();
    expect((await badgeRow(badge))?.iconKey).toBeNull();
  });
});
