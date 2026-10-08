/**
 * B6-4 (D4) — o contrato HTTP das 8 rotas de usuários com a autoridade nos use cases. Molde da
 * casa (B6-2a..2d, B6-3): módulos REAIS (createUserManagementModule / createReportingModule)
 * sobre portas falsas em memória, só `requireAuth` dobrado — `requireApiActor`, `userActor`, a
 * matriz de permissões e os use cases são os de produção. Um duplo de módulo não faz o teste
 * falhar, faz o 403 desaparecer (lição medida no B6-2a).
 *
 * Ordens congeladas (medidas nas rotas legado antes do movimento):
 *  - status/roles/points: 403 ANTES da validação do id/ação — por isso a rota chama
 *    `assertCanManageUsers` primeiro (padrão B6-2b/2d/3).
 *  - POST /users e POST /users/approve: 403 ANTES do parse — corpo quebrado para quem não pode
 *    é 403, nunca 500/400.
 *  - users/[id] GET/PUT/DELETE e profile: a validação do id (400 "Usuário inválido") vem ANTES
 *    do gate, como na rota legado.
 *  - GET users/[id] ausente: 404 LEGADO {error} verbatim, sem code (null do use case).
 *  - DELETE users/[id]: ausência agora é NotFoundError mapeado (404 tipado) — gate ainda antes.
 * Mensagens congeladas: "Acesso negado" (default), "Não autorizado" (profile), "Acesso negado."
 * com ponto final (approve), "Sem permissão para criar usuários" (POST /users).
 *
 * A TRAVA DE CAMPOS do PUT (filterSelfEditableUserFields) é provada aqui de ponta a ponta:
 * VOLUNTARIO editando a si mesmo escreve `name` e NÃO escreve `roles`/`status`/`weekHours`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createReportingModule } from "@/backend/modules/reporting";
import { createUserManagementModule } from "@/backend/modules/user-management";
import type { HoursReadRepository } from "@/backend/modules/reporting/application/ports/hours-read.repository";
import type { ReportingDirectory } from "@/backend/modules/reporting/application/ports/reporting-directory.port";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  store: [] as Array<Record<string, unknown>>,
  memberships: [] as Array<{ userId: number; projectId: number; project: Record<string, unknown> }>,
}));

vi.mock("@/backend/composition/root", () => {
  const repository = {
    async findById(id: number) {
      return mocks.store.find((u) => u.id === id) ?? null;
    },
    async findByEmail(email: string) {
      return mocks.store.find((u) => String(u.email).toLowerCase() === String(email).toLowerCase()) ?? null;
    },
    async create(data: Record<string, unknown>) {
      const created = { id: 90 + mocks.store.length, ...data };
      mocks.store.push(created);
      return created;
    },
    async update(record: Record<string, unknown>) {
      const index = mocks.store.findIndex((u) => u.id === record.id);
      mocks.store[index] = record;
      return record;
    },
    async delete(id: number) {
      mocks.store.splice(mocks.store.findIndex((u) => u.id === id), 1);
    },
    async countBlockingDependencies() {
      return 0;
    },
    async findPending() {
      return mocks.store.filter((u) => u.status === "pending");
    },
    async findActiveUsers() {
      return mocks.store.filter((u) => u.status === "active");
    },
  };

  // Portas do reporting usadas por GET /users/[id]/project-hours (a rota é de usuário, o use
  // case é do módulo reporting — medido antes de mover o gate).
  const directory = {
    async findMemberships(userId: number) {
      return mocks.memberships.filter((m) => m.userId === userId);
    },
  } as unknown as ReportingDirectory;
  const hoursRead = {
    async findCompletedWithRelations() {
      return [];
    },
  } as unknown as HoursReadRepository;

  return {
    getBackendComposition: () => ({
      userManagement: createUserManagementModule({
        repository: repository as never,
        passwordHasher: { async hash() { return "hashed"; } },
      }),
      reporting: createReportingModule({ ports: { directory, hoursRead } }),
    }),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { GET as usersList, POST as usersCreate } from "@/app/api/users/route";
import { DELETE as userDelete, GET as userGet, PUT as userPut } from "@/app/api/users/[id]/route";
import { PATCH as userStatus } from "@/app/api/users/[id]/status/route";
import { PATCH as userRoles } from "@/app/api/users/[id]/roles/route";
import { PATCH as userPoints } from "@/app/api/users/[id]/points/route";
import { GET as profileGet, PATCH as profilePatch } from "@/app/api/users/[id]/profile/route";
import { GET as approveList, POST as approvePost } from "@/app/api/users/approve/route";
import { GET as projectHours } from "@/app/api/users/[id]/project-hours/route";

function login(roles: string[], id = 999) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function request(path: string, init?: { method?: string; body?: unknown; raw?: string }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    body: init?.raw !== undefined ? init.raw : init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const body = async (response: Response) => await response.json();

describe("B6-4 — as 8 rotas de usuários com a autoridade nos use cases", () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.store = [
      { id: 1, name: "Ana", email: "ana@x.com", points: 0, completedTasks: 0, password: "hashed", status: "active", weekHours: 10, currentWeekHours: 0, profileVisibility: "public", bio: "bio da ana", avatar: null, roles: ["VOLUNTARIO"] },
      { id: 4, name: "Bruno", email: "bruno@x.com", points: 0, completedTasks: 0, password: "hashed", status: "pending", weekHours: 0, currentWeekHours: 0, profileVisibility: "public", bio: null, avatar: null, roles: [] },
    ];
    mocks.memberships = [{ userId: 1, projectId: 5, project: { id: 5, name: "Projeto X", status: "active" } }];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("GET /api/users: VOLUNTARIO vê a lista básica; COORDENADOR vê com email/bio (visibilidade lendo o ActorRef)", async () => {
    login(["VOLUNTARIO"], 1);
    const basic = await body(await usersList());
    expect(basic.users[0]).not.toHaveProperty("email");
    expect(basic.users[0]).not.toHaveProperty("bio");

    login(["COORDENADOR"]);
    const full = await body(await usersList());
    expect(full.users[0]).toHaveProperty("email");
    expect(full.users[0]).toHaveProperty("bio");
  });

  describe("POST /api/users — assert 403-antes-do-parse", () => {
    it("VOLUNTARIO com corpo válido é 403 com a mensagem própria", async () => {
      login(["VOLUNTARIO"], 1);
      const denied = await usersCreate(
        request("/api/users", { method: "POST", body: { name: "Novo", email: "n@x.com", password: "secret123" } }),
      );
      expect(denied.status).toBe(403);
      expect(await body(denied)).toMatchObject({ error: "Sem permissão para criar usuários", code: "FORBIDDEN" });
    });

    it("corpo inválido (JSON quebrado) para quem não pode é 403, não 500", async () => {
      login(["VOLUNTARIO"], 1);
      expect((await usersCreate(request("/api/users", { method: "POST", raw: "não é json" }))).status).toBe(403);
    });

    it("COORDENADOR cria (201) e o gate não travou o caminho", async () => {
      login(["COORDENADOR"]);
      const created = await usersCreate(
        request("/api/users", { method: "POST", body: { name: "Novo", email: "n@x.com", password: "secret123" } }),
      );
      expect(created.status).toBe(201);
      expect((await body(created)).user).toMatchObject({ email: "n@x.com" });
    });
  });

  describe("GET/PUT/DELETE /api/users/[id]", () => {
    it("GET: dono lê; outro sem gestão é 403 'Acesso negado'; MANAGE_USERS lê; ausente é 404 LEGADO {error} sem code", async () => {
      login(["VOLUNTARIO"], 1);
      expect((await userGet(request("/api/users/1"), params("1"))).status).toBe(200);

      const denied = await userGet(request("/api/users/4"), params("4"));
      expect(denied.status).toBe(403);
      expect(await body(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });

      login(["COORDENADOR"]);
      expect((await userGet(request("/api/users/4"), params("4"))).status).toBe(200);

      const missing = await userGet(request("/api/users/99"), params("99"));
      expect(missing.status).toBe(404);
      expect(await body(missing)).toEqual({ error: "Usuário não encontrado" }); // verbatim, sem code

      expect((await userGet(request("/api/users/abc"), params("abc"))).status).toBe(400);
    });

    it("PUT: VOLUNTARIO editando a si mesmo escreve 'name' e NÃO escreve roles/status/weekHours (trava no use case)", async () => {
      login(["VOLUNTARIO"], 1);
      const response = await userPut(
        request("/api/users/1", { method: "PUT", body: { name: "Ana Nova", roles: ["ADMIN"], status: "active", weekHours: 99 } }),
        params("1"),
      );
      expect(response.status).toBe(200);
      expect(await body(response)).toMatchObject({ user: { name: "Ana Nova", roles: ["VOLUNTARIO"], weekHours: 10 } });
    });

    it("PUT: VOLUNTARIO editando OUTRO é 403; COORDENADOR escreve os campos de gestão", async () => {
      login(["VOLUNTARIO"], 1);
      expect((await userPut(request("/api/users/4", { method: "PUT", body: { name: "X" } }), params("4"))).status).toBe(403);

      login(["COORDENADOR"]);
      const response = await userPut(request("/api/users/1", { method: "PUT", body: { roles: ["PESQUISADOR"] } }), params("1"));
      expect(response.status).toBe(200);
      expect((await body(response)).user.roles).toEqual(["PESQUISADOR"]);
    });

    it("DELETE: nem o DONO exclui (gate PURO); ausente PARA quem não pode é 403 antes do 404; COORDENADOR exclui", async () => {
      login(["VOLUNTARIO"], 1);
      expect((await userDelete(request("/api/users/1"), params("1"))).status).toBe(403);
      expect((await userDelete(request("/api/users/99"), params("99"))).status).toBe(403);

      login(["COORDENADOR"]);
      expect((await userDelete(request("/api/users/99"), params("99"))).status).toBe(404); // NotFoundError mapeado

      const ok = await userDelete(request("/api/users/4"), params("4"));
      expect(ok.status).toBe(200);
      expect(await body(ok)).toEqual({ success: true });
    });
  });

  describe("PATCH status/roles/points — assert ANTES da validação (ordem medida)", () => {
    it("VOLUNTARIO com id inválido leva 403, não 400 (o assert roda primeiro)", async () => {
      login(["VOLUNTARIO"], 1);
      expect((await userStatus(request("/api/users/abc/status", { method: "PATCH", body: { action: "approve" } }), params("abc"))).status).toBe(403);
      expect((await userRoles(request("/api/users/1/roles", { method: "PATCH", body: { action: "nao-existe" } }), params("1"))).status).toBe(403);
      expect((await userPoints(request("/api/users/1/points", { method: "PATCH", body: { action: "set", points: 5 } }), params("1"))).status).toBe(403);
    });

    it("COORDENADOR passa nos três, e as validações de entrada continuam com as mensagens legadas", async () => {
      login(["COORDENADOR"]);
      const status = await userStatus(request("/api/users/4/status", { method: "PATCH", body: { action: "suspend" } }), params("4"));
      expect(status.status).toBe(200);
      expect((await body(status)).user.status).toBe("suspended");

      const roles = await userRoles(request("/api/users/1/roles", { method: "PATCH", body: { action: "add", role: "PESQUISADOR" } }), params("1"));
      expect(roles.status).toBe(200);

      const points = await userPoints(request("/api/users/1/points", { method: "PATCH", body: { action: "set", points: -20 } }), params("1"));
      expect(points.status).toBe(200); // DEC-60: set aceita negativo
      expect((await body(points)).user.points).toBe(-20);

      const invalidAction = await userPoints(request("/api/users/1/points", { method: "PATCH", body: { action: "multiplicar", points: 5 } }), params("1"));
      expect(invalidAction.status).toBe(400);
    });
  });

  describe("GET/PATCH /api/users/[id]/profile — mensagem própria 'Não autorizado'", () => {
    it("VOLUNTARIO lendo/editando OUTRO leva 'Não autorizado' (não o default); dono e gestão passam", async () => {
      login(["VOLUNTARIO"], 1);
      const denied = await profileGet(request("/api/users/4/profile"), params("4"));
      expect(denied.status).toBe(403);
      expect(await body(denied)).toMatchObject({ error: "Não autorizado", code: "FORBIDDEN" });

      expect((await profileGet(request("/api/users/1/profile"), params("1"))).status).toBe(200);

      const deniedPatch = await profilePatch(request("/api/users/4/profile", { method: "PATCH", body: { name: "X" } }), params("4"));
      expect(deniedPatch.status).toBe(403);
      expect(await body(deniedPatch)).toMatchObject({ error: "Não autorizado" });

      const own = await profilePatch(request("/api/users/1/profile", { method: "PATCH", body: { name: "Ana Nova" } }), params("1"));
      expect(own.status).toBe(200);
      expect((await body(own)).user.name).toBe("Ana Nova");

      login(["COORDENADOR"]);
      expect((await profileGet(request("/api/users/4/profile"), params("4"))).status).toBe(200);
    });
  });

  describe("GET/POST /api/users/approve — 'Acesso negado.' com ponto final; POST com assert antes do parse", () => {
    it("VOLUNTARIO na fila leva a mensagem própria (com PONTO FINAL)", async () => {
      login(["VOLUNTARIO"], 1);
      const denied = await approveList();
      expect(denied.status).toBe(403);
      expect(await body(denied)).toMatchObject({ error: "Acesso negado.", code: "FORBIDDEN" });
    });

    it("JSON quebrado para quem não pode é 403, não 500", async () => {
      login(["VOLUNTARIO"], 1);
      expect((await approvePost(request("/api/users/approve", { method: "POST", raw: "não é json" }))).status).toBe(403);
    });

    it("COORDENADOR: lista 200; corpo inválido 400 legado; approve escreve", async () => {
      login(["COORDENADOR"]);
      const list = await approveList();
      expect(list.status).toBe(200);
      expect((await body(list)).pendingUsers).toHaveLength(1);

      expect((await approvePost(request("/api/users/approve", { method: "POST", body: { userId: 0, action: "approve" } }))).status).toBe(400);

      const approved = await approvePost(request("/api/users/approve", { method: "POST", body: { userId: 4, action: "approve" } }));
      expect(approved.status).toBe(200);
      expect((await body(approved)).user.status).toBe("active");
    });
  });

  it("GET /api/users/[id]/project-hours: dono lê; outro sem gestão é 403 'Acesso negado'; gestão lê (gate no use case do reporting)", async () => {
    login(["VOLUNTARIO"], 1);
    const own = await projectHours(request("/api/users/1/project-hours"), params("1"));
    expect(own.status).toBe(200);
    expect((await body(own)).hours).toHaveLength(1);

    const denied = await projectHours(request("/api/users/4/project-hours"), params("4"));
    expect(denied.status).toBe(403);
    expect(await body(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });

    login(["COORDENADOR"]);
    expect((await projectHours(request("/api/users/1/project-hours"), params("1"))).status).toBe(200);

    // a validação do id (400) continua ANTES do gate, como na rota legado
    login(["VOLUNTARIO"], 1);
    expect((await projectHours(request("/api/users/abc/project-hours"), params("abc"))).status).toBe(400);
  });
});
