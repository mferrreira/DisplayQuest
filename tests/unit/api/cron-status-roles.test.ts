// @vitest-environment node
/**
 * B6-1a — correção de autorização em /api/cron/status: GERENTE passa a ter acesso.
 *
 * Defeito medido em 2026-10-05: a rota usava `ensureAnyRole(actor, ["COORDENADOR"])`, mas
 * COORDENADOR e GERENTE têm permissões IDÊNTICAS em `backend/domain/identity/permissions.ts`
 * (comparadas linha a linha: nenhuma permissão difere). As rotas irmãs que protegem o mesmo
 * tipo de gestão — `/api/weekly-hours-history` e `/api/projects/stats` — usam `MANAGE_USERS`,
 * que cobre COORDENADOR **e** GERENTE. Ou seja: um papel com autoridade idêntica era barrado
 * num endpoint de gestão enquanto entrava nos outros dois. Nenhum comentário ou teste congelava
 * isso como quirk, ao contrário dos quirks que o repo documenta explicitamente.
 *
 * DEC-51 (dono 2026-10-05): corrigir para `MANAGE_USERS` e a mensagem das rotas irmãs. Esta é a
 * ÚNICA mudança de comportamento do B6 — e por isso é lote próprio (B6-1a), separado da migração
 * de arquitetura (B6-1b), para poder ser revertido sem desfazer o refactor.
 *
 * A correção ainda é feita na rota porque o B6-1b (mover o enforcement para o use case de
 * work-execution) não foi executado; o teste abaixo vale para as duas fases — é o contrato.
 *
 * Fixtures: `identityAccess` é o módulo REAL e `api-guard`/`rbac` rodam de verdade; só a
 * identidade (`requireAuth`) e o `cronService` são dobrados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";

const mocks = vi.hoisted(() => {
  const state = {
    session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
    manualResetExecutado: false,
  };
  return {
    state,
    cronService: {
      getStatus: () => ({ isInitialized: true, weeklyResetRunning: false }),
      executeManualReset: async () => {
        state.manualResetExecutado = true;
      },
    },
  };
});

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({ identityAccess: createIdentityAccessModule() }),
}));

vi.mock("@/lib/services/cron-service", () => ({ cronService: mocks.cronService }));

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.state.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.state.session },
}));

import { GET as cronStatusGet, POST as cronStatusPost } from "@/app/api/cron/status/route";

function login(roles: string[]) {
  mocks.state.session = { id: 42, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function request(body?: unknown) {
  return new NextRequest(new URL("/api/cron/status", "http://localhost:3000"), {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const body = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.state.session = null;
  mocks.state.manualResetExecutado = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("B6-1a — /api/cron/status aceita os dois papéis de gestão (MANAGE_USERS)", () => {
  it.each(["COORDENADOR", "GERENTE"])("GET 200 para %s", async (papel) => {
    login([papel]);
    const response = await cronStatusGet();
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ status: { isInitialized: true, weeklyResetRunning: false } });
  });

  it.each(["COORDENADOR", "GERENTE"])("POST manual-reset executa para %s", async (papel) => {
    login([papel]);
    const response = await cronStatusPost(request({ action: "manual-reset" }));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ message: "Reset manual executado com sucesso" });
    expect(mocks.state.manualResetExecutado).toBe(true);
  });

  it.each([
    ["LABORATORISTA", "tem Manage_work_sessions, mas não manage_users"],
    ["GERENTE_PROJETO", "tem manage_projects, mas não manage_users"],
    ["COLABORADOR", "tem manage_tasks, mas não manage_users"],
    ["PESQUISADOR", "tem manage_tasks, mas não manage_users"],
    ["VOLUNTARIO", "não tem nenhuma permissão de gestão"],
  ])("%s recebe 403 (%s)", async (papel) => {
    login([papel]);
    const get = await cronStatusGet();
    expect(get.status).toBe(403);
    expect(await body(get)).toEqual({ error: "Apenas coordenadores e gerentes podem acessar." });

    mocks.state.manualResetExecutado = false;
    const post = await cronStatusPost(request({ action: "manual-reset" }));
    expect(post.status).toBe(403);
    expect(await body(post)).toEqual({ error: "Apenas coordenadores e gerentes podem acessar." });
    expect(mocks.state.manualResetExecutado).toBe(false);
  });

  it("sem sessão devolve 401 antes do gate de papel", async () => {
    mocks.state.session = null;
    expect((await cronStatusGet()).status).toBe(401);
    expect((await cronStatusPost(request({ action: "manual-reset" }))).status).toBe(401);
  });
});