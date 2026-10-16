// @vitest-environment node
/**
 * Contrato HTTP do feed "Atividade recente" (GET /api/tasks/activity).
 *
 *   sem sessao        → 401
 *   autenticado       → 200 com `items` na ordem da porta
 *   `?limit=`         → chega intacto na porta; sem forma vira 15; fora de [1,50] e aparo
 *
 * A rota e leitura aberta ao autenticado (o titulo de tarefa ja e visivel ao autenticado), entao
 * nao ha gate de projeto aqui — o que se prova e que NENHUM papel e recusado e que o limite e
 * sanitarizado antes de alcancar a porta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  limits: [] as number[],
  items: [] as unknown[],
}));

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({
    taskManagement: {
      listActivity: async (limit: number) => {
        mocks.limits.push(limit);
        return mocks.items;
      },
    },
  }),
}));

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { GET as activityRoute } from "@/app/api/tasks/activity/route";

function login(roles: string[], id = 1) {
  mocks.session = { id, email: "u@lab.com", name: `Usuário ${id}`, roles, status: "active" };
}

function request(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"), { method: "GET" });
}

beforeEach(() => {
  mocks.session = null;
  mocks.limits = [];
  mocks.items = [
    { id: 1, action: "CREATE", taskId: 1, taskTitle: "Lida", toStatus: "to-do", actorId: 1, actorName: "Coordenador", at: "2026-10-16T12:00:00.000Z" },
  ];
});

describe("GET /api/tasks/activity", () => {
  it("sem sessao e 401", async () => {
    const response = await activityRoute(request("/api/tasks/activity"));
    expect(response.status).toBe(401);
    expect(mocks.limits).toEqual([]);
  });

  it("autenticado devolve 200 com os items na ordem da porta", async () => {
    login(["VOLUNTARIO"]);
    const response = await activityRoute(request("/api/tasks/activity"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ action: "CREATE", taskTitle: "Lida" });
    // default sem `?limit=`
    expect(mocks.limits).toEqual([15]);
  });

  it("nenhum papel e recusado — leitura aberta ao autenticado", async () => {
    for (const roles of [["VOLUNTARIO"], ["PESQUISADOR"], ["COORDENADOR"]]) {
      login(roles);
      const response = await activityRoute(request("/api/tasks/activity"));
      expect(response.status).toBe(200);
    }
  });

  it("`?limit=` chega intacto na porta", async () => {
    login(["COORDENADOR"]);
    await activityRoute(request("/api/tasks/activity?limit=7"));
    expect(mocks.limits).toEqual([7]);
  });

  it("limite sem forma vira 15", async () => {
    login(["COORDENADOR"]);
    await activityRoute(request("/api/tasks/activity?limit=abc"));
    expect(mocks.limits).toEqual([15]);
  });

  it("limite fora de [1,50] e aparo antes de alcancar a porta", async () => {
    login(["COORDENADOR"]);
    await activityRoute(request("/api/tasks/activity?limit=999"));
    await activityRoute(request("/api/tasks/activity?limit=0"));
    await activityRoute(request("/api/tasks/activity?limit=-5"));
    expect(mocks.limits).toEqual([50, 1, 1]);
  });
});
