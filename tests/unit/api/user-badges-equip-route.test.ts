/**
 * plan-v15 S04 (R9, CA4/CA6) — a rota POST /api/user-badges/[userId]/[badgeId]/equip com o
 * módulo REAL sobre portas falsas.
 *
 * O que fica congelado:
 *  - self é o gate: equipar de OUTRO usuário é 403 "Não autorizado" e nada é gravado;
 *  - os gates do domínio na ordem do MODELO: conquistada (404 "Usuário não possui este
 *    badge"), passiva (400 "Badge sem passiva não é equipável"), slot (409 "Slots de
 *    passiva cheios" na 4ª equipagem);
 *  - a validação da rota (params e o booleano `equipped`) continua na rota, com os corpos
 *    de rota {error} sem code;
 *  - desequipar não disputa slot e é 200.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createGamificationModule } from "@/backend/modules/gamification";
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port";
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  badges: [] as Array<Record<string, unknown>>,
  userBadges: [] as Array<Record<string, unknown>>,
  writes: [] as string[],
}));

vi.mock("@/backend/composition/root", () => {
  const notUsed = (name: string) => (): never => {
    throw new Error(`porta de gamification não deveria ser usada neste teste: ${name}`);
  };
  const unused = new Proxy({}, { get: (_t, p) => notUsed(String(p)) }) as never;

  const badges: BadgeCatalogPort = {
    async findById(id) {
      return (mocks.badges.find((b) => b.id === id) as never) ?? null;
    },
    async findAll() { return notUsed("badges.findAll")(); },
    async findActive() { return notUsed("badges.findActive")(); },
    async findByCategory() { return notUsed("badges.findByCategory")(); },
    async create() { return notUsed("badges.create")(); },
    async update() { return notUsed("badges.update")(); },
    async delete() { return notUsed("badges.delete")(); },
  };

  const userBadges: UserBadgePort = {
    async findByUserId() { return notUsed("userBadges.findByUserId")(); },
    async findRecentByUserId() { return notUsed("userBadges.findRecentByUserId")(); },
    async findByUserAndBadge(userId, badgeId) {
      return (mocks.userBadges.find((ub) => ub.userId === userId && ub.badgeId === badgeId) as never) ?? null;
    },
    async create() { return notUsed("userBadges.create")(); },
    async delete() { return notUsed("userBadges.delete")(); },
    async countEquippedByUserId(userId) {
      return mocks.userBadges.filter((ub) => ub.userId === userId && ub.equipped === true).length;
    },
    async setEquipped(id, equipped) {
      mocks.writes.push(`setEquipped:${id}:${equipped}`);
      const found = mocks.userBadges.find((ub) => ub.id === id)!;
      found.equipped = equipped;
      return found as never;
    },
  };

  const realGamification = createGamificationModule({
    ports: { badges, userBadges, users: unused, awardHistory: unused, stats: unused, metrics: unused },
  });

  return { getBackendComposition: () => ({ gamification: realGamification }) };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { POST as equipRoute } from "@/app/api/user-badges/[userId]/[badgeId]/equip/route";

const SELF_ID = 42;
const OTHER_ID = 7;

function login(id: number, roles: string[] = ["VOLUNTARIO"]) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function request(method: string, path: string, body?: unknown) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function params<T extends Record<string, string>>(values: T) {
  return { params: Promise.resolve(values) };
}

const body = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.badges = [
    { id: 10, name: "Bônus pequeno", description: "d", category: "achievement", isActive: true, createdBy: 1, effect: { kind: "bonus", pct: 0.1 } },
    { id: 11, name: "Sem passiva", description: "d", category: "milestone", isActive: true, createdBy: 1, effect: null },
    { id: 12, name: "Passiva 12", description: "d", category: "achievement", isActive: true, createdBy: 1, effect: { kind: "bonus", pct: 0.05 } },
    { id: 13, name: "Passiva 13", description: "d", category: "achievement", isActive: true, createdBy: 1, effect: { kind: "penaltyReduction", pct: 0.05 } },
    { id: 14, name: "Passiva 14", description: "d", category: "achievement", isActive: true, createdBy: 1, effect: { kind: "bonus", pct: 0.05 } },
  ];
  mocks.userBadges = [10, 11, 12, 13, 14].map((badgeId, i) => ({ id: 100 + i, userId: SELF_ID, badgeId, equipped: false }));
  mocks.writes = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/user-badges/[userId]/[badgeId]/equip", () => {
  it("sem sessão devolve 401", async () => {
    const response = await equipRoute(request("POST", "/api/user-badges/42/10/equip", { equipped: true }), params({ userId: "42", badgeId: "10" }));
    expect(response.status).toBe(401);
    expect(mocks.writes).toHaveLength(0);
  });

  it("equipar a própria passiva é 200 e grava equipped", async () => {
    login(SELF_ID);
    const response = await equipRoute(request("POST", "/api/user-badges/42/10/equip", { equipped: true }), params({ userId: "42", badgeId: "10" }));
    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({ userBadge: { userId: SELF_ID, badgeId: 10, equipped: true } });
    expect(mocks.writes).toEqual(["setEquipped:100:true"]);
  });

  it("equipar badge de OUTRO usuário é 403 'Não autorizado' e nada é gravado", async () => {
    login(SELF_ID);
    const response = await equipRoute(request("POST", "/api/user-badges/7/10/equip", { equipped: true }), params({ userId: "7", badgeId: "10" }));
    expect(response.status).toBe(403);
    expect(await body(response)).toMatchObject({ error: "Não autorizado", code: "FORBIDDEN" });
    expect(mocks.writes).toHaveLength(0);
  });

  it("badge não conquistado é 404 com a mensagem congelada", async () => {
    login(SELF_ID);
    const response = await equipRoute(request("POST", "/api/user-badges/42/99/equip", { equipped: true }), params({ userId: "42", badgeId: "99" }));
    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({ error: "Usuário não possui este badge", code: "NOT_FOUND" });
  });

  it("badge sem passiva não é equipável: 400 com a frase da casa", async () => {
    login(SELF_ID);
    const response = await equipRoute(request("POST", "/api/user-badges/42/11/equip", { equipped: true }), params({ userId: "42", badgeId: "11" }));
    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({ error: "Badge sem passiva não é equipável", code: "VALIDATION_ERROR" });
    expect(mocks.writes).toHaveLength(0);
  });

  it("a 4ª equipagem leva 409 'Slots de passiva cheios'; as três primeiras passam", async () => {
    login(SELF_ID);
    for (const badgeId of [12, 13, 14]) {
      const ok = await equipRoute(request("POST", `/api/user-badges/42/${badgeId}/equip`, { equipped: true }), params({ userId: "42", badgeId: String(badgeId) }));
      expect(ok.status).toBe(200);
    }
    const fourth = await equipRoute(request("POST", "/api/user-badges/42/10/equip", { equipped: true }), params({ userId: "42", badgeId: "10" }));
    expect(fourth.status).toBe(409);
    expect(await body(fourth)).toMatchObject({ error: "Slots de passiva cheios", code: "CONFLICT" });
    expect(mocks.writes.filter((w) => w.endsWith(":true"))).toHaveLength(3);
  });

  it("desequipar não disputa slot: com os 3 cheios, desequipar é 200", async () => {
    login(SELF_ID);
    for (const badgeId of [12, 13, 14]) {
      await equipRoute(request("POST", `/api/user-badges/42/${badgeId}/equip`, { equipped: true }), params({ userId: "42", badgeId: String(badgeId) }));
    }
    const off = await equipRoute(request("POST", "/api/user-badges/42/12/equip", { equipped: false }), params({ userId: "42", badgeId: "12" }));
    expect(off.status).toBe(200);
    expect(await body(off)).toMatchObject({ userBadge: { badgeId: 12, equipped: false } });
  });

  it("a rota valida antes do domínio: param inválido é 400 'Parâmetros inválidos' e `equipped` não-booleano é 400 'equipped é obrigatório'", async () => {
    login(SELF_ID);
    const badParam = await equipRoute(request("POST", "/api/user-badges/0/10/equip", { equipped: true }), params({ userId: "0", badgeId: "10" }));
    expect(badParam.status).toBe(400);
    expect(await body(badParam)).toEqual({ error: "Parâmetros inválidos" });

    const badBody = await equipRoute(request("POST", "/api/user-badges/42/10/equip", { equipped: "sim" }), params({ userId: "42", badgeId: "10" }));
    expect(badBody.status).toBe(400);
    expect(await body(badBody)).toEqual({ error: "equipped é obrigatório" });
    expect(mocks.writes).toHaveLength(0);
  });
});
