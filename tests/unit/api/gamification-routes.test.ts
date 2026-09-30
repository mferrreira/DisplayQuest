// @vitest-environment node
/**
 * OND6-B4 (R4) — rota tests of app/api/badges/*, app/api/user-badges/* and
 * app/api/users/[id]/gamification.
 *
 * Mocked seams: `@/backend/composition/root` (fake GamificationModule),
 * `@/lib/auth/api-guard` and `@/lib/auth/rbac`. The routes themselves are NOT mocked —
 * these tests pin the HTTP contract (AC-00-07): stable status for typed business
 * conditions via domainErrorResponse, route-level validations unchanged, frozen payload
 * shapes.
 *
 * Intentional status evolutions (documented in STATE 6.4):
 *   - POST /badges validation errors: 500 (message leaked via error.message) -> 400
 *     ValidationError {error,code,details}.
 *   - PUT/DELETE /badges/[id] "Badge não encontrado": 500 -> 404.
 *   - POST /user-badges "Badge não encontrado": 500 -> 404; "Usuário já possui este
 *     badge": 500 -> 409.
 *   - DELETE /user-badges/[userId]/[badgeId] "Usuário não possui este badge": 500 -> 404.
 *   - GET /users/[id]/gamification "Usuário não encontrado": 500 -> 404.
 *   Non-DomainError paths keep the legacy 500 shape verbatim.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ConflictError, NotFoundError, ValidationError } from "@/backend/domain";

const mocks = vi.hoisted(() => {
  const state = {
    throwKind: null as null | "validation" | "notfound-badge" | "notfound-user" | "conflict" | "plain",
    canManageUsers: true,
  };
  const fakeModule = {
    listBadges: async () => {
      if (state.throwKind === "plain") throw new Error("db down");
      return [{ id: 1, name: "A", category: "achievement" }];
    },
    createBadge: async (command: Record<string, unknown>) => {
      if (state.throwKind === "validation") throw new ValidationError("Nome do badge é obrigatório");
      if (state.throwKind === "plain") throw new Error("db down");
      return { id: 100, name: String(command.name ?? ""), createdBy: command.createdBy };
    },
    getBadgeById: async (id: number) => (id === 999 ? null : { id, name: "A" }),
    updateBadge: async (command: Record<string, unknown>) => {
      if (state.throwKind === "notfound-badge") throw new NotFoundError("Badge não encontrado");
      return { id: command.id, name: (command.data as Record<string, unknown>)?.name ?? "A" };
    },
    deleteBadge: async () => {
      if (state.throwKind === "notfound-badge") throw new NotFoundError("Badge não encontrado");
    },
    listUserBadges: async () => [{ id: 1, userId: 7, badgeId: 10 }],
    listRecentUserBadges: async (_userId: number, limit?: number) =>
      limit === 2 ? [{ id: 1, userId: 7, badgeId: 12 }, { id: 2, userId: 7, badgeId: 11 }] : [{ id: 1, userId: 7, badgeId: 12 }],
    awardBadge: async (command: Record<string, unknown>) => {
      if (state.throwKind === "notfound-badge") throw new NotFoundError("Badge não encontrado");
      if (state.throwKind === "conflict") throw new ConflictError("Usuário já possui este badge");
      return { id: 55, userId: command.userId, badgeId: command.badgeId, earnedBy: command.awardedBy };
    },
    removeUserBadge: async () => {
      if (state.throwKind === "notfound-user") throw new NotFoundError("Usuário não possui este badge");
    },
    getUserProgression: async (userId: number) => {
      if (state.throwKind === "notfound-user") throw new NotFoundError("Usuário não encontrado");
      return { userId, points: 250, xp: 250, level: 2, elo: "BRONZE", nextLevelXp: 300, progressToNextLevel: 50 };
    },
  };
  const auth = {
    actor: { id: 42, name: "Ana", roles: ["COORDENADOR"] } as { id: number; name: string; roles: string[] },
  };
  return { fakeModule, auth, state };
});

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({ gamification: mocks.fakeModule }),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireApiActor: async () => ({ actor: mocks.auth.actor }),
  ensurePermission: () => null,
  ensureSelfOrPermission: () => null,
}));

vi.mock("@/lib/auth/rbac", () => ({
  hasPermission: () => mocks.state.canManageUsers,
}));

import { GET as badgesList, POST as badgesCreate } from "@/app/api/badges/route";
import { DELETE as badgeDelete, GET as badgeGet, PUT as badgeUpdate } from "@/app/api/badges/[id]/route";
import { GET as userBadgesList, POST as userBadgesAward } from "@/app/api/user-badges/route";
import { DELETE as userBadgeRemove } from "@/app/api/user-badges/[userId]/[badgeId]/route";
import { GET as userGamification } from "@/app/api/users/[id]/gamification/route";

function makeRequest(path: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

function params<T extends Record<string, string>>(values: T) {
  return { params: Promise.resolve(values) };
}

async function bodyOf(response: Response) {
  return await response.json();
}

beforeEach(() => {
  mocks.state.throwKind = null;
  mocks.state.canManageUsers = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST/GET /api/badges", () => {
  it("GET lista badges (shape congelado { badges })", async () => {
    const response = await badgesList();
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({ badges: [{ id: 1, name: "A", category: "achievement" }] });
  });

  it("GET erro nao-DomainError mantem o 500 legado", async () => {
    mocks.state.throwKind = "plain";
    const response = await badgesList();
    expect(response.status).toBe(500);
    expect(await bodyOf(response)).toEqual({ error: "Erro ao buscar badges" });
  });

  it("POST valido => 201 { badge } com createdBy do actor", async () => {
    const response = await badgesCreate(makeRequest("/api/badges", { method: "POST", body: { name: "Novo", description: "d", category: "social" } }));
    expect(response.status).toBe(201);
    const body = await bodyOf(response);
    expect(body.badge).toMatchObject({ id: 100, name: "Novo", createdBy: 42 });
  });

  it("EVOLUTION: ValidationError => 400 tipado (antes 500 com message)", async () => {
    mocks.state.throwKind = "validation";
    const response = await badgesCreate(makeRequest("/api/badges", { method: "POST", body: { name: "  " } }));
    expect(response.status).toBe(400);
    const body = await bodyOf(response);
    expect(body).toMatchObject({ error: "Nome do badge é obrigatório", code: "VALIDATION_ERROR" });
  });

  it("POST erro nao-DomainError mantem 500 com message legado", async () => {
    mocks.state.throwKind = "plain";
    const response = await badgesCreate(makeRequest("/api/badges", { method: "POST", body: { name: "x" } }));
    expect(response.status).toBe(500);
    expect(await bodyOf(response)).toEqual({ error: "db down" });
  });
});

describe("GET/PUT/DELETE /api/badges/[id]", () => {
  it("GET id invalido => 400 'Badge inválido' (validacao de rota congelada)", async () => {
    const response = await badgeGet(makeRequest("/api/badges/abc"), params({ id: "abc" }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "Badge inválido" });
  });

  it("GET inexistente => 404 manual (shape legado)", async () => {
    const response = await badgeGet(makeRequest("/api/badges/999"), params({ id: "999" }));
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toEqual({ error: "Badge não encontrado" });
  });

  it("GET existente => 200 { badge }", async () => {
    const response = await badgeGet(makeRequest("/api/badges/1"), params({ id: "1" }));
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({ badge: { id: 1, name: "A" } });
  });

  it("EVOLUTION: PUT 'Badge não encontrado' => 404 (antes 500)", async () => {
    mocks.state.throwKind = "notfound-badge";
    const response = await badgeUpdate(makeRequest("/api/badges/1", { method: "PUT", body: { name: "x" } }), params({ id: "1" }));
    expect(response.status).toBe(404);
    const body = await bodyOf(response);
    expect(body).toMatchObject({ error: "Badge não encontrado", code: "NOT_FOUND" });
  });

  it("PUT valido => 200 { badge }", async () => {
    const response = await badgeUpdate(makeRequest("/api/badges/1", { method: "PUT", body: { name: "Novo" } }), params({ id: "1" }));
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({ badge: { id: 1, name: "Novo" } });
  });

  it("EVOLUTION: DELETE 'Badge não encontrado' => 404; valido => { success: true }", async () => {
    mocks.state.throwKind = "notfound-badge";
    const denied = await badgeDelete(makeRequest("/api/badges/1", { method: "DELETE" }), params({ id: "1" }));
    expect(denied.status).toBe(404);

    mocks.state.throwKind = null;
    const ok = await badgeDelete(makeRequest("/api/badges/1", { method: "DELETE" }), params({ id: "1" }));
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toEqual({ success: true });
  });
});

describe("GET/POST /api/user-badges", () => {
  it("GET sem userId => 400; userId invalido => 400 (validacoes congeladas)", async () => {
    const missing = await userBadgesList(makeRequest("/api/user-badges"));
    expect(missing.status).toBe(400);
    expect(await bodyOf(missing)).toEqual({ error: "userId é obrigatório" });

    const invalid = await userBadgesList(makeRequest("/api/user-badges?userId=abc"));
    expect(invalid.status).toBe(400);
    expect(await bodyOf(invalid)).toEqual({ error: "userId inválido" });
  });

  it("GET => { badges, recentBadges, count } (shape congelado; limit repassado)", async () => {
    const response = await userBadgesList(makeRequest("/api/user-badges?userId=7&limit=2"));
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body).toMatchObject({ badges: [{ id: 1, userId: 7, badgeId: 10 }], count: 1 });
    expect(body.recentBadges.map((b: { badgeId: number }) => b.badgeId)).toEqual([12, 11]);
  });

  it("POST sem MANAGE_USERS => 403 'Acesso negado' (congelado)", async () => {
    mocks.state.canManageUsers = false;
    const response = await userBadgesAward(makeRequest("/api/user-badges", { method: "POST", body: { badgeId: 10, userId: 7 } }));
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toEqual({ error: "Acesso negado" });
  });

  it("POST ids invalidos => 400 'badgeId e userId são obrigatórios' (congelado)", async () => {
    const response = await userBadgesAward(makeRequest("/api/user-badges", { method: "POST", body: { badgeId: 0, userId: 7 } }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "badgeId e userId são obrigatórios" });
  });

  it("POST valido => 201 { userBadge } com awardedBy default = actor", async () => {
    const response = await userBadgesAward(makeRequest("/api/user-badges", { method: "POST", body: { badgeId: 10, userId: 7 } }));
    expect(response.status).toBe(201);
    const body = await bodyOf(response);
    expect(body.userBadge).toMatchObject({ userId: 7, badgeId: 10, earnedBy: 42 });
  });

  it("EVOLUTION: POST 'Badge não encontrado' => 404 (antes 500)", async () => {
    mocks.state.throwKind = "notfound-badge";
    const response = await userBadgesAward(makeRequest("/api/user-badges", { method: "POST", body: { badgeId: 999, userId: 7 } }));
    expect(response.status).toBe(404);
    expect((await bodyOf(response)).error).toBe("Badge não encontrado");
  });

  it("EVOLUTION: POST 'Usuário já possui este badge' => 409 (antes 500)", async () => {
    mocks.state.throwKind = "conflict";
    const response = await userBadgesAward(makeRequest("/api/user-badges", { method: "POST", body: { badgeId: 10, userId: 7 } }));
    expect(response.status).toBe(409);
    const body = await bodyOf(response);
    expect(body).toMatchObject({ error: "Usuário já possui este badge", code: "CONFLICT" });
  });
});

describe("DELETE /api/user-badges/[userId]/[badgeId]", () => {
  it("params invalidos => 400 'Parâmetros inválidos' (congelado)", async () => {
    const response = await userBadgeRemove(makeRequest("/api/user-badges/0/10", { method: "DELETE" }), params({ userId: "0", badgeId: "10" }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "Parâmetros inválidos" });
  });

  it("EVOLUTION: 'Usuário não possui este badge' => 404 (antes 500); valido => { success: true }", async () => {
    mocks.state.throwKind = "notfound-user";
    const denied = await userBadgeRemove(makeRequest("/api/user-badges/7/10", { method: "DELETE" }), params({ userId: "7", badgeId: "10" }));
    expect(denied.status).toBe(404);
    expect((await bodyOf(denied)).error).toBe("Usuário não possui este badge");

    mocks.state.throwKind = null;
    const ok = await userBadgeRemove(makeRequest("/api/user-badges/7/10", { method: "DELETE" }), params({ userId: "7", badgeId: "10" }));
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toEqual({ success: true });
  });
});

describe("GET /api/users/[id]/gamification", () => {
  it("id invalido => 400 'Usuário inválido' (congelado)", async () => {
    const response = await userGamification(makeRequest("/api/users/abc/gamification"), params({ id: "abc" }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "Usuário inválido" });
  });

  it("GET => 200 { progression } (shape congelado)", async () => {
    const response = await userGamification(makeRequest("/api/users/7/gamification"), params({ id: "7" }));
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body.progression).toMatchObject({ userId: 7, level: 2, elo: "BRONZE", nextLevelXp: 300 });
  });

  it("EVOLUTION: 'Usuário não encontrado' => 404 (antes 500)", async () => {
    mocks.state.throwKind = "notfound-user";
    const response = await userGamification(makeRequest("/api/users/999/gamification"), params({ id: "999" }));
    expect(response.status).toBe(404);
    expect((await bodyOf(response)).error).toBe("Usuário não encontrado");
  });
});
