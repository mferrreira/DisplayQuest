// @vitest-environment node
/**
 * repo-cleanup B5 (D5) — rota tests das rotas que entraram no mapper domainErrorResponse.
 *
 * Pinned (AC-00-07): DomainError -> status estavel (Validation 400 / NotFound 404 /
 * Conflict 409 / Forbidden 403) com shape {error,code,details}; nao-DomainError -> 500
 * GENERICO sem vazar error.message no corpo (os 500 antigos de purchases/[id],
 * users/statistics e cron/status vazavam details/message internos).
 *
 * Evolucao documentada: purchases/[id] com NotFoundError/ConflictError tipados do store
 * antes viravam 500 com details = mensagem interna; agora 404/409 mapeados.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain";

const mocks = vi.hoisted(() => {
  const fakeStore = {
    getPurchase: async (id: number): Promise<{ id: number; userId: number; status: string } | null> => ({ id, userId: 42, status: "pending" }),
    updatePurchase: async (id: number) => ({ id }),
    patchPurchase: async (id: number) => ({ id }),
    deletePurchase: async () => undefined,
  };
  const fakeUsers = {
    listUserStatistics: async () => [],
    listLeaderboard: async () => [],
    listProfiles: async () => [],
  };
  const behavior = {
    storeError: null as unknown | null,
    usersError: null as unknown | null,
    purchaseNull: false,
  };
  return { fakeStore, fakeUsers, behavior };
});

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({ store: mocks.fakeStore, userManagement: mocks.fakeUsers }),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireApiActor: async () => ({ actor: { id: 42, roles: ["COORDENADOR"] } }),
  ensurePermission: () => null,
  ensureAnyRole: () => null,
  ensureSelfOrPermission: () => null,
}));

vi.mock("@/lib/auth/rbac", () => ({
  hasPermission: () => true,
}));

vi.mock("@/lib/services/cron-service", () => ({
  cronService: {
    getStatus: () => ({ isInitialized: true, weeklyResetRunning: true }),
    executeManualReset: async () => undefined,
  },
}));

import {
  DELETE as purchaseDelete,
  GET as purchaseGet,
  PATCH as purchasePatch,
  PUT as purchasePut,
} from "@/app/api/purchases/[id]/route";
import { GET as statisticsGet } from "@/app/api/users/statistics/route";
import { GET as leaderboardGet } from "@/app/api/users/leaderboard/route";
import { GET as profilesGet } from "@/app/api/users/profiles/route";
import { GET as cronStatusGet, POST as cronStatusPost } from "@/app/api/cron/status/route";

function makeRequest(path: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mocks.behavior.storeError = null;
  mocks.behavior.usersError = null;
  mocks.behavior.purchaseNull = false;
  mocks.fakeStore.getPurchase = async (id: number) => {
    if (mocks.behavior.storeError) throw mocks.behavior.storeError;
    if (mocks.behavior.purchaseNull) return null;
    return { id, userId: 42, status: "pending" };
  };
  mocks.fakeStore.updatePurchase = async (id: number) => {
    if (mocks.behavior.storeError) throw mocks.behavior.storeError;
    return { id };
  };
  mocks.fakeStore.patchPurchase = async (id: number) => {
    if (mocks.behavior.storeError) throw mocks.behavior.storeError;
    return { id };
  };
  mocks.fakeStore.deletePurchase = async () => {
    if (mocks.behavior.storeError) throw mocks.behavior.storeError;
  };
  mocks.fakeUsers.listUserStatistics = async () => {
    if (mocks.behavior.usersError) throw mocks.behavior.usersError;
    return [];
  };
  mocks.fakeUsers.listLeaderboard = async () => {
    if (mocks.behavior.usersError) throw mocks.behavior.usersError;
    return [];
  };
  mocks.fakeUsers.listProfiles = async () => {
    if (mocks.behavior.usersError) throw mocks.behavior.usersError;
    return [];
  };
});

describe("B5 — /api/purchases/[id] no mapper (antes: DomainError virava 500 com details vazado)", () => {
  it("GET NotFoundError tipado -> 404 mapeado (antes 500 + details)", async () => {
    mocks.behavior.storeError = new NotFoundError("Compra não encontrada");
    const response = await purchaseGet(makeRequest("/api/purchases/9") as never, idContext("9"));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Compra não encontrada");
    expect(body.code).toBe("NOT_FOUND");
  });

  it("GET sem purchase (null) -> 404 legado preservado", async () => {
    mocks.behavior.purchaseNull = true;
    const response = await purchaseGet(makeRequest("/api/purchases/9") as never, idContext("9"));
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Compra não encontrada");
  });

  it("PUT ValidationError -> 400 com mensagem", async () => {
    mocks.behavior.storeError = new ValidationError("Status inválido");
    const response = await purchasePut(makeRequest("/api/purchases/1", { method: "PUT", body: { status: "x" } }) as never, idContext("1"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Status inválido");
  });

  it("PATCH ConflictError -> 409 (antes 500 + details)", async () => {
    mocks.behavior.storeError = new ConflictError("Compra já finalizada");
    const response = await purchasePatch(makeRequest("/api/purchases/1", { method: "PATCH", body: { action: "complete" } }) as never, idContext("1"));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("Compra já finalizada");
  });

  it("DELETE erro nao-Domain -> 500 generico SEM details/message interno", async () => {
    mocks.behavior.storeError = new Error("P2025 interna feia");
    const response = await purchaseDelete(makeRequest("/api/purchases/1", { method: "DELETE" }) as never, idContext("1"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Erro ao excluir compra");
    expect(body.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("P2025");
  });
});

describe("B5 — /api/users/{statistics,leaderboard,profiles} no mapper", () => {
  it("statistics ValidationError -> 400 (antes 500 com message vazado)", async () => {
    mocks.behavior.usersError = new ValidationError("Tipo de estatística inválido");
    const response = await statisticsGet(makeRequest("/api/users/statistics?type=x"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Tipo de estatística inválido");
  });

  it("statistics erro nao-Domain -> 500 generico sem message interno", async () => {
    mocks.behavior.usersError = new Error("stack interna");
    const response = await statisticsGet(makeRequest("/api/users/statistics"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Erro ao buscar estatísticas dos usuários");
    expect(JSON.stringify(body)).not.toContain("stack interna");
  });

  it("leaderboard NotFoundError -> 404", async () => {
    mocks.behavior.usersError = new NotFoundError("não encontrado");
    const response = await leaderboardGet(makeRequest("/api/users/leaderboard"));
    expect(response.status).toBe(404);
  });

  it("profiles ForbiddenError -> 403", async () => {
    mocks.behavior.usersError = new ForbiddenError("Acesso negado");
    const response = await profilesGet(makeRequest("/api/users/profiles"));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Acesso negado");
  });
});

describe("B5 — /api/cron/status no mapper (antes: error.message no corpo do 500)", () => {
  it("GET 200 com status do cron", async () => {
    const response = await cronStatusGet();
    expect(response.status).toBe(200);
    expect((await response.json()).status.weeklyResetRunning).toBe(true);
  });

  it("POST acao desconhecida -> 400 legado preservado", async () => {
    const response = await cronStatusPost(makeRequest("/api/cron/status", { method: "POST", body: { action: "nope" } }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Ação não reconhecida");
  });
});
