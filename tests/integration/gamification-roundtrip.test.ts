// @vitest-environment node
/**
 * OND6-B4 — G4 roundtrip smoke of the gamification module against the ISOLATED test DB
 * (127.0.0.1:5433 — DEC-10/BLOCKER-02; never 5432).
 *
 * Exercises the NEW wiring end-to-end with real Prisma (no mocks):
 *   createBadge (QUIRK-6B: isActive forcado true) -> getBadgeById/listBadges ->
 *   updateBadge (merge parcial) -> awardFromWorkSession (pontos + history atomico +
 *   idempotencia por descricao) -> awardFromTaskCompletion -> getUserProgression ->
 *   evaluateUserBadges (concessao automatica FUNCIONANDO — a divergencia QUIRK-6A do
 *   legado, pinada no contract OND6-B3 e submetida ao dono) -> awardBadge manual +
 *   conflito -> removeUserBadge -> deleteBadge -> erros tipados (usuario inexistente).
 *
 * Module built with `createGamificationModule()` exactly as the composition root builds
 * it (use cases over the thin Prisma adapters).
 *
 * O banco de teste pode conter badges seedados — as asserções olham para os IDs criados
 * por este arquivo, nunca para contagens globais. Cleanup em afterAll: history (FK
 * performedBy -> users, sem cascade), depois badges (user_badges cascade com badge/user),
 * depois users.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { createGamificationModule } from "@/backend/modules/gamification";

const gamification = createGamificationModule();

const stamp = Date.now();
const WORK_SESSION_ID = 900000 + (stamp % 1000);
const TASK_ID = 910000 + (stamp % 1000);
const TASK_ID_2 = 920000 + (stamp % 1000);

let userId = 0;
let badgeId = 0;
let criteriaBadgeId = 0;
let manualBadgeId = 0;

describe("G4 roundtrip — gamification (isolated test DB)", () => {
  beforeAll(async () => {
    const user = await prisma.users.create({
      data: {
        name: `G6 Ana ${stamp}`,
        email: `g6-gamification-ana-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["VOLUNTARIO"],
      },
      select: { id: true },
    });
    userId = user.id;

    const badge = await gamification.createBadge({
      name: "  G6 Pioneiro  ",
      description: "  badge de roundtrip  ",
      category: "milestone",
      criteria: { points: 999999 }, // nunca atingido por acidente
      isActive: false, // QUIRK-6B: sera gravado como TRUE
      createdBy: userId,
    });
    badgeId = badge.id!;

    const manualBadge = await gamification.createBadge({
      name: `G6 Manual ${stamp}`,
      description: "concedido manualmente",
      category: "special",
      createdBy: userId,
    });
    manualBadgeId = manualBadge.id!;
    // criteriaBadge e criado DENTRO do teste de avaliacao: os awards anteriores
    // disparam evaluateUserBadges internamente e nao devem encontra-lo ativo.
  });

  afterAll(async () => {
    await prisma.history.deleteMany({
      where: { action: "GAMIFICATION_AWARD", entityId: userId },
    });
    await prisma.badges.deleteMany({ where: { id: { in: [badgeId, criteriaBadgeId, manualBadgeId] } } });
    await prisma.users.delete({ where: { id: userId } });
  });

  it("createBadge persiste com trim e QUIRK-6B (isActive:false vira true na coluna)", async () => {
    const row = await prisma.badges.findUnique({ where: { id: badgeId } });
    expect(row?.name).toBe("G6 Pioneiro");
    expect(row?.description).toBe("badge de roundtrip");
    expect(row?.isActive).toBe(true); // QUIRK-6B
    expect(row?.criteria).toEqual({ points: 999999 });
    expect(row?.createdBy).toBe(userId);
  });

  it("getBadgeById + listBadges (createdAt DESC) enxergam o badge criado", async () => {
    const found = await gamification.getBadgeById(badgeId);
    expect(found?.name).toBe("G6 Pioneiro");

    const all = await gamification.listBadges();
    const ids = all.map((b) => b.id);
    expect(ids).toContain(badgeId);
    // createdAt DESC: os badges deste teste sao os mais recentes do store
    expect(ids.slice(0, 2)).toEqual(expect.arrayContaining([manualBadgeId, badgeId]));
  });

  it("updateBadge faz merge parcial (criteria preservado, isActive agora FALSE via Boolean())", async () => {
    const updated = await gamification.updateBadge({ id: badgeId, data: { name: "G6 Pioneiro v2", isActive: false } });
    expect(updated.name).toBe("G6 Pioneiro v2");
    expect(updated.isActive).toBe(false);
    expect(updated.criteria).toEqual({ points: 999999 });

    const row = await prisma.badges.findUnique({ where: { id: badgeId } });
    expect(row?.isActive).toBe(false);
  });

  it("awardFromWorkSession: +30 pontos atomicos com history GAMIFICATION:WORK_SESSION_COMPLETED:<id>", async () => {
    const result = await gamification.awardFromWorkSession({
      userId,
      workSessionId: WORK_SESSION_ID,
      durationSeconds: 7200,
    });

    expect(result.pointsAwarded).toBe(30);
    expect(result.alreadyAwarded).toBe(false);
    expect(result.newProgression.points).toBe(30);

    const userRow = await prisma.users.findUnique({ where: { id: userId }, select: { points: true } });
    expect(userRow?.points).toBe(30);

    const historyRow = await prisma.history.findFirst({
      where: { action: "GAMIFICATION_AWARD", entityId: userId, description: `GAMIFICATION:WORK_SESSION_COMPLETED:${WORK_SESSION_ID}` },
    });
    expect(historyRow).not.toBeNull();
    expect(historyRow?.performedBy).toBe(userId);
    expect(historyRow?.newValues).toEqual({
      sourceType: "WORK_SESSION_COMPLETED",
      sourceId: WORK_SESSION_ID,
      pointsAwarded: 30,
      xpAwarded: 30,
    });
  });

  it("awardFromWorkSession e idempotente: segunda chamada nao incrementa nem duplica history", async () => {
    const second = await gamification.awardFromWorkSession({
      userId,
      workSessionId: WORK_SESSION_ID,
      durationSeconds: 7200,
    });

    expect(second.alreadyAwarded).toBe(true);
    expect(second.pointsAwarded).toBe(0);
    expect(second.newProgression.points).toBe(30);

    const count = await prisma.history.count({
      where: { action: "GAMIFICATION_AWARD", entityId: userId, description: `GAMIFICATION:WORK_SESSION_COMPLETED:${WORK_SESSION_ID}` },
    });
    expect(count).toBe(1);
  });

  it("awardFromTaskCompletion: floor(15.7)=15 e default 10; progressao reflete o acumulado", async () => {
    const a = await gamification.awardFromTaskCompletion({ userId, taskId: TASK_ID, taskPoints: 15.7 });
    expect(a.pointsAwarded).toBe(15);

    const b = await gamification.awardFromTaskCompletion({ userId, taskId: TASK_ID_2 });
    expect(b.pointsAwarded).toBe(10);

    const progression = await gamification.getUserProgression(userId);
    expect(progression.points).toBe(55); // 30 + 15 + 10
    expect(progression.level).toBe(0);
    expect(progression.nextLevelXp).toBe(100);
    expect(progression.progressToNextLevel).toBe(55);
    expect(progression.elo).toBe("BRONZE");
  });

  it("evaluateUserBadges: concessao automatica FUNCIONA na wiring nova (divergencia QUIRK-6A vs legado)", async () => {
    const criteriaBadge = await gamification.createBadge({
      name: `G6 Marcante ${stamp}`,
      description: "criterio atingivel no roundtrip",
      category: "achievement",
      criteria: { points: 40 },
      createdBy: userId,
    });
    criteriaBadgeId = criteriaBadge.id!;

    const awarded = await gamification.evaluateUserBadges(userId);
    expect(awarded.map((b) => b.id)).toContain(criteriaBadgeId); // criteria { points: 40 } <= 55

    const row = await prisma.user_badges.findUnique({
      where: { userId_badgeId: { userId, badgeId: criteriaBadgeId } },
    });
    expect(row).not.toBeNull();
    expect(row?.earnedBy).toBeNull(); // caminho de regras: earnedBy null

    // nao duplica na segunda passada
    const again = await gamification.evaluateUserBadges(userId);
    expect(again.map((b) => b.id)).not.toContain(criteriaBadgeId);
  });

  it("awardBadge manual: earnedBy = awardedBy; duplicado lanca 'Usuário já possui este badge'", async () => {
    const userBadge = await gamification.awardBadge({ badgeId: manualBadgeId, userId, awardedBy: userId });
    expect(userBadge.earnedBy).toBe(userId);

    await expect(gamification.awardBadge({ badgeId: manualBadgeId, userId })).rejects.toThrow("Usuário já possui este badge");
  });

  it("removeUserBadge remove; inexistente lanca 'Usuário não possui este badge'", async () => {
    await gamification.removeUserBadge(userId, manualBadgeId);
    const gone = await prisma.user_badges.findUnique({
      where: { userId_badgeId: { userId, badgeId: manualBadgeId } },
    });
    expect(gone).toBeNull();

    await expect(gamification.removeUserBadge(userId, manualBadgeId)).rejects.toThrow("Usuário não possui este badge");
  });

  it("deleteBadge remove o badge (user_badges cascade com o badge); inexistente lanca 'Badge não encontrado'", async () => {
    await gamification.deleteBadge(badgeId);
    expect(await prisma.badges.findUnique({ where: { id: badgeId } })).toBeNull();
    await expect(gamification.deleteBadge(badgeId)).rejects.toThrow("Badge não encontrado");
  });

  it("usuario inexistente: getUserProgression -> 'Usuário não encontrado'; award falha no tx (sem history)", async () => {
    await expect(gamification.getUserProgression(999999)).rejects.toThrow("Usuário não encontrado");

    await expect(gamification.awardFromWorkSession({ userId: 999999, workSessionId: 999 })).rejects.toThrow();
    const orphan = await prisma.history.findFirst({
      where: { action: "GAMIFICATION_AWARD", entityId: 999999 },
    });
    expect(orphan).toBeNull();
  });
});
