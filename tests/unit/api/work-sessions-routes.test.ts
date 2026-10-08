// @vitest-environment node
/**
 * OND3-B3 (R4) + B6-5 (D4) — rota tests of app/api/work-sessions/* and app/api/daily_logs/*.
 *
 * B6-5 re-molde (padrão DEC-90, mesmo dos lotes B6-2a..2d/B6-3/B6-4): o MODULO REAL
 * (createWorkExecutionModule) sobre portas falsas em memoria; so `requireAuth` e dobrado —
 * `requireApiActor`, `userActor`, a matriz de permissoes e a resolucao de escopo sao as de
 * producao. Um duplo de modulo nao faria o teste falhar, faria o 403 desaparecer.
 *
 * O que continua congelado (contrato HTTP): validacoes de entrada com mensagem propria
 * ("projectId inválido", "userId inválido"), dispatch do PATCH por status explicito, payloads
 * {data}/{logs}/{success:true}, POST daily_logs 410, PATCH/DELETE daily_logs 410.
 *
 * Evolucoes medidas deste lote (documentadas em STATE.json, batch B6-5):
 *  - 403 migrados passaram a {error, code, details} (superset, DEC-53) mantendo as mensagens
 *    legadas: "Acesso negado" (gate self-ou-gestao e lider no work-sessions), "Acesso negado."
 *    COM PONTO no daily_logs, "Não autorizado a atualizar/excluir esta sessão" (mensagens
 *    proprias do use case — o gate redundante da rota, que devolvia o default "Acesso negado",
 *    foi removido e a mensagem do use case virou fonte unica).
 *  - 404 de sessao ausente no PATCH/DELETE passou de corpo manual para NotFoundError mapeado
 *    (superset). O 404 do log ausente continua LEGADO {error} verbatim (o use case devolve
 *    null, a rota monta o corpo antigo).
 *  - O quirk "Consulta de sessões inválida" (userId+status) ficou INALCANÇÁVEL pela rota: a
 *    rota aplica prioridade de parametros (active > userId > status) e nunca envia os dois;
 *    o quirk segue congelado no golden do use case.
 *  - O `catch {}` do caminho do lider em daily_logs engolia TUDO como 403; removido, erro de
 *    infraestrutura agora e 500.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createWorkExecutionModule } from "@/backend/modules/work-execution";
import type { DailyLog, WorkSession } from "@/backend/domain";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  workRows: [] as Array<WorkSession & { id: number }>,
  logRows: [] as Array<DailyLog & { id: number }>,
  led: [] as number[],
  managed: [] as number[],
  memberships: [] as Array<{ projectId: number; userId: number }>,
  tasks: [] as Array<{ id: number; projectId: number | null; completed: boolean; assignedTo: number }>,
  audits: [] as Array<Record<string, unknown>>,
  sessionTasks: [] as Array<{ sessionId: number; taskIds: number[] }>,
  failRead: false,
}));

vi.mock("@/backend/composition/root", () => {
  let nextSessionId = 1000;
  let nextLogId = 1;

  const workSessions = {
    async findById(id: number) {
      if (mocks.failRead) throw new Error("db down");
      const row = mocks.workRows.find((s) => s.id === id);
      return row ? { ...row } : null;
    },
    async findActiveByUserId(userId: number) {
      const rows = mocks.workRows.filter((s) => s.userId === userId && s.status === "active");
      return rows[0] ? { ...rows[0] } : null;
    },
    async findByUserId(userId: number) {
      if (mocks.failRead) throw new Error("db down");
      return mocks.workRows.filter((s) => s.userId === userId).map((s) => ({ ...s }));
    },
    async findAll() {
      if (mocks.failRead) throw new Error("db down");
      return mocks.workRows.map((s) => ({ ...s }));
    },
    async findByStatus(status: string) {
      return mocks.workRows.filter((s) => s.status === status).map((s) => ({ ...s }));
    },
    async create(session: Record<string, unknown>) {
      const row = { ...session, id: nextSessionId++ } as WorkSession & { id: number };
      mocks.workRows.push(row);
      return { ...row };
    },
    async update(id: number, updates: Record<string, unknown>) {
      const row = mocks.workRows.find((s) => s.id === id);
      if (!row) throw new Error("Session not found");
      for (const key of ["userName", "startTime", "endTime", "duration", "activity", "location", "projectId", "status"] as const) {
        if (updates[key] !== undefined) (row as unknown as Record<string, unknown>)[key] = updates[key];
      }
      return { ...row };
    },
    async delete(id: number) {
      mocks.workRows = mocks.workRows.filter((s) => s.id !== id);
    },
    async replaceSessionTasks(sessionId: number, taskIds: number[]) {
      mocks.sessionTasks.push({ sessionId, taskIds });
    },
  };

  const dailyLogs = {
    async findById(id: number) {
      return mocks.logRows.find((l) => l.id === id) ?? null;
    },
    async findByUserId(userId: number) {
      return mocks.logRows.filter((l) => l.userId === userId);
    },
    async findByProjectId(projectId: number) {
      return mocks.logRows.filter((l) => l.projectId === projectId);
    },
    async findByWorkSessionId(workSessionId: number) {
      return mocks.logRows.find((l) => l.workSessionId === workSessionId) ?? null;
    },
    async findByDate(userId: number, date: Date) {
      return mocks.logRows.filter((l) => l.userId === userId && l.date.toDateString() === date.toDateString());
    },
    async findAll() {
      return mocks.logRows;
    },
    async create(dailyLog: Record<string, unknown>) {
      const row = { ...dailyLog, id: nextLogId++ } as DailyLog & { id: number };
      mocks.logRows.push(row);
      return row;
    },
    async update(dailyLog: DailyLog & { id: number }) {
      const index = mocks.logRows.findIndex((l) => l.id === dailyLog.id);
      mocks.logRows[index] = dailyLog;
      return dailyLog;
    },
    async findUserById(userId: number) {
      return userId === 7 ? { id: 7, name: "Ana" } : userId === 8 ? { id: 8, name: "Beto" } : null;
    },
  };

  const projectAccess = {
    async isProjectMember(userId: number, projectId: number) {
      return mocks.memberships.some((m) => m.projectId === projectId && m.userId === userId);
    },
    async ledProjectIds(_leaderId: number) {
      return Array.from(new Set([...mocks.led, ...mocks.managed]));
    },
    async listProjectLogs(projectIds: number[], memberUserId?: number) {
      return mocks.logRows
        .filter((l) => l.projectId != null && projectIds.includes(l.projectId))
        .filter((l) => memberUserId === undefined || l.userId === memberUserId)
        .map((l) => ({ ...l }));
    },
    async listProjectSessions(projectIds: number[], memberUserId?: number) {
      return mocks.workRows
        .filter((s) => s.projectId != null && projectIds.includes(s.projectId))
        .filter((s) => memberUserId === undefined || s.userId === memberUserId)
        .map((s) => ({ ...s }));
    },
    async recordLeaderLogsAudit(audit: Record<string, unknown>) {
      mocks.audits.push(audit);
    },
  };

  const taskVerification = {
    async findCompletedAssignedTasks(userId: number, taskIds: number[]) {
      return mocks.tasks.filter((t) => taskIds.includes(t.id) && t.completed && t.assignedTo === userId);
    },
  };

  return {
    getBackendComposition: () => ({
      workExecution: createWorkExecutionModule({
        ports: {
          workSessions: workSessions as never,
          dailyLogs: dailyLogs as never,
          projectAccess: projectAccess as never,
          taskVerification: taskVerification as never,
          cronOperations: { async getStatus() { return { enabled: false }; }, async executeManualReset() { return undefined; } } as never,
        },
      }),
    }),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { GET as sessionsList, POST as sessionsCreate } from "@/app/api/work-sessions/route";
import { DELETE as sessionDelete, PATCH as sessionPatch } from "@/app/api/work-sessions/[id]/route";
import { GET as logsList, POST as logsCreate } from "@/app/api/daily_logs/route";
import { GET as logGet, PATCH as logPatch, DELETE as logDelete } from "@/app/api/daily_logs/[id]/route";

function login(roles: string[], id = 42, name = "Ana") {
  mocks.session = { id, email: "user@lab.com", name, roles, status: "active" };
}

function makeRequest(path: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function bodyOf(response: Response) {
  return await response.json();
}

// startTime "agora": nenhuma pausa agendada foi cruzada DESDE o inicio, entao a normalizacao
// lazy (expiredPausePatch) nao pausa as linhas do fixture — o teste foca no contrato HTTP.
function seedRows() {
  const now = new Date();
  mocks.workRows = [
    { id: 1, userId: 7, userName: "Ana", startTime: now, endTime: null, duration: null, activity: null, location: null, projectId: 5, status: "active" },
    { id: 2, userId: 8, userName: "Beto", startTime: now, endTime: null, duration: null, activity: null, location: null, projectId: 6, status: "active" },
    { id: 3, userId: 8, userName: "Beto", startTime: now, endTime: null, duration: null, activity: null, location: null, projectId: 5, status: "active" },
  ];
  mocks.logRows = [
    { id: 1, userId: 7, projectId: 5, date: now, note: "log da ana", workSessionId: null, createdAt: new Date(0) },
  ];
  mocks.led = [];
  mocks.managed = [];
  mocks.memberships = [];
  mocks.tasks = [];
  mocks.audits = [];
  mocks.sessionTasks = [];
  mocks.failRead = false;
}

beforeEach(() => {
  seedRows();
  login(["COORDENADOR"]);
});

describe("GET /api/work-sessions", () => {
  it("projectId invalid -> 400 (route validation unchanged)", async () => {
    const response = await sessionsList(makeRequest("/api/work-sessions?projectId=abc"));
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toBe("projectId inválido");
  });

  it("projectId + non-manager leader path: empty scope -> 403 'Acesso negado' (superset); scoped sessions returned, userId filter client-side", async () => {
    login(["VOLUNTARIO"]);
    const denied = await sessionsList(makeRequest("/api/work-sessions?projectId=5"));
    expect(denied.status).toBe(403);
    expect(await bodyOf(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });

    mocks.led = [5];
    const ok = await sessionsList(makeRequest("/api/work-sessions?projectId=5&userId=8"));
    expect(ok.status).toBe(200);
    expect((await bodyOf(ok)).data.map((s: { id: number }) => s.id)).toEqual([3]);
  });

  it("leader path maps out-of-scope projectId to 403 typed body (superset, DEC-16)", async () => {
    login(["VOLUNTARIO"]);
    mocks.led = [5];
    const response = await sessionsList(makeRequest("/api/work-sessions?projectId=8"));
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("manager: projectId filter; active=true -> status query; non-manager default -> own sessions", async () => {
    const byProject = await sessionsList(makeRequest("/api/work-sessions?projectId=5"));
    expect((await bodyOf(byProject)).data.map((s: { id: number }) => s.id)).toEqual([1, 3]);

    const active = await sessionsList(makeRequest("/api/work-sessions?active=true"));
    expect(active.status).toBe(200);
    expect((await bodyOf(active)).data.map((s: { id: number }) => s.id)).toEqual([1, 2, 3]);

    login(["VOLUNTARIO"], 7);
    const own = await sessionsList(makeRequest("/api/work-sessions"));
    expect(own.status).toBe(200);
    expect((await bodyOf(own)).data.map((s: { id: number }) => s.id)).toEqual([1]);
  });

  it("non-manager pedindo OUTRO usuario: 403 'Acesso negado' (gate que era da rota, agora no use case)", async () => {
    login(["VOLUNTARIO"]);
    const blocked = await sessionsList(makeRequest("/api/work-sessions?userId=9"));
    expect(blocked.status).toBe(403);
    expect(await bodyOf(blocked)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("non-manager com status: filtro IGNORADO (quirk congelado) — ve as proprias, nao e 403 nem 400", async () => {
    login(["VOLUNTARIO"], 7);
    const own = await sessionsList(makeRequest("/api/work-sessions?status=completed"));
    expect(own.status).toBe(200);
    expect((await bodyOf(own)).data.map((s: { id: number }) => s.id)).toEqual([1]);
  });

  it("unknown error stays 500 (a porta de infraestrutura falhou de verdade)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.failRead = true;
    const failed = await sessionsList(makeRequest("/api/work-sessions"));
    mocks.failRead = false;
    expect(failed.status).toBe(500);
    expect((await bodyOf(failed)).error).toBe("Erro ao buscar sessões de trabalho");
    spy.mockRestore();
  });
});

describe("POST /api/work-sessions", () => {
  it("userId invalid -> 400 (validacao de entrada ANTES do gate, ordem medida)", async () => {
    login(["VOLUNTARIO"]);
    const invalid = await sessionsCreate(makeRequest("/api/work-sessions", { method: "POST", body: { userId: "abc" } }));
    expect(invalid.status).toBe(400);
    expect((await bodyOf(invalid)).error).toBe("userId inválido");
  });

  it("manager cria para outro (201 active); nao-gestor criando PARA OUTRO e 403 'Acesso negado'", async () => {
    const created = await sessionsCreate(
      makeRequest("/api/work-sessions", { method: "POST", body: { userId: 7, userName: "Ana", activity: "Lab" } }),
    );
    expect(created.status).toBe(201);
    expect((await bodyOf(created)).data.status).toBe("active");

    login(["VOLUNTARIO"]);
    const denied = await sessionsCreate(
      makeRequest("/api/work-sessions", { method: "POST", body: { userId: 8, userName: "Beto" } }),
    );
    expect(denied.status).toBe(403);
    expect(await bodyOf(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("escopo do nome (medido na rota): nao-gestor escreve SEMPRE o proprio nome da sessao", async () => {
    login(["VOLUNTARIO"], 7);
    const created = await sessionsCreate(
      makeRequest("/api/work-sessions", { method: "POST", body: { userId: 7, userName: "Nome Falsificado" } }),
    );
    expect(created.status).toBe(201);
    expect((await bodyOf(created)).data.userName).toBe("Ana");
  });

  it("status=completed + endTime completes on create (manual entry flow) -> 201 completed", async () => {
    const response = await sessionsCreate(
      makeRequest("/api/work-sessions", {
        method: "POST",
        body: { userId: 7, userName: "Ana", status: "completed", endTime: new Date().toISOString(), projectId: 5 },
      }),
    );
    expect(response.status).toBe(201);
    expect((await bodyOf(response)).data.status).toBe("completed");
  });

  it("typed errors map: membership 403 and invalid startTime 400", async () => {
    login(["VOLUNTARIO"], 7);
    const forbidden = await sessionsCreate(
      makeRequest("/api/work-sessions", { method: "POST", body: { userId: 7, userName: "Ana", projectId: 5 } }),
    );
    expect(forbidden.status).toBe(403);
    expect((await bodyOf(forbidden)).error).toBe("Usuário não é membro do projeto informado");

    const invalid = await sessionsCreate(
      makeRequest("/api/work-sessions", { method: "POST", body: { userId: 7, userName: "Ana", startTime: "x" } }),
    );
    expect(invalid.status).toBe(400);
    expect((await bodyOf(invalid)).error).toBe("startTime inválido");
  });
});

describe("PATCH /api/work-sessions/[id] — dispatch by explicit status (completion intent removed)", () => {
  it("missing session -> 404 (NotFoundError mapeado, superset — evolucao medida)", async () => {
    const response = await sessionPatch(makeRequest("/api/work-sessions/9", { method: "PATCH", body: { status: "paused" } }), idContext("9"));
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toMatchObject({ error: "Sessão não encontrada", code: "NOT_FOUND" });
  });

  it("foreign session sem gestao -> 403 com a mensagem PROPRIA do use case (o gate redundante da rota saiu)", async () => {
    login(["VOLUNTARIO"]);
    const blocked = await sessionPatch(makeRequest("/api/work-sessions/1", { method: "PATCH", body: { status: "paused" } }), idContext("1"));
    expect(blocked.status).toBe(403);
    expect(await bodyOf(blocked)).toMatchObject({ error: "Não autorizado a atualizar esta sessão", code: "FORBIDDEN" });
  });

  it("status=completed routes to completeWorkSession (daily log upsert = trilha da conclusao)", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await sessionPatch(
      makeRequest("/api/work-sessions/1", { method: "PATCH", body: { status: "completed", dailyLogNote: "ok" } }),
      idContext("1"),
    );
    expect(response.status).toBe(200);
    expect((await bodyOf(response)).data.status).toBe("completed");
    const log = mocks.logRows.find((l) => l.workSessionId === 1);
    expect(log?.note).toBe("ok");
  });

  it("status=paused routes to updateWorkSession (pause math stays server-side; no log row)", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await sessionPatch(makeRequest("/api/work-sessions/1", { method: "PATCH", body: { status: "paused" } }), idContext("1"));
    expect(response.status).toBe(200);
    expect((await bodyOf(response)).data.status).toBe("paused");
    expect(mocks.logRows.find((l) => l.workSessionId === 1)).toBeUndefined();
  });

  it("EVOLUTION: endTime/dailyLogNote WITHOUT status no longer triggers completeWorkSession", async () => {
    login(["VOLUNTARIO"], 7);
    mocks.memberships.push({ projectId: 5, userId: 7 }); // o use case real checa membro quando o corpo traz projectId
    const response = await sessionPatch(
      makeRequest("/api/work-sessions/1", {
        method: "PATCH",
        body: { endTime: new Date().toISOString(), dailyLogNote: "x", projectId: 5 },
      }),
      idContext("1"),
    );
    expect(response.status).toBe(200);
    expect(mocks.logRows.find((l) => l.workSessionId === 1)).toBeUndefined(); // conclusao nao ocorreu: nenhum log criado
  });

  it("typed errors map: Forbidden 403, Validation 400 (mensagens congeladas)", async () => {
    login(["VOLUNTARIO"], 7);
    const invalid = await sessionPatch(
      makeRequest("/api/work-sessions/1", { method: "PATCH", body: { completedTaskIds: [10] } }),
      idContext("1"),
    );
    expect(invalid.status).toBe(400);
    expect((await bodyOf(invalid)).error).toBe("Só é possível vincular tasks em sessões finalizadas");
  });
});

describe("DELETE /api/work-sessions/[id]", () => {
  it("missing -> 404 (NotFoundError mapeado); owner -> 200 {success:true}; foreign sem gestao -> 403 mensagem propria", async () => {
    const notFound = await sessionDelete(makeRequest("/api/work-sessions/9", { method: "DELETE" }), idContext("9"));
    expect(notFound.status).toBe(404);
    expect(await bodyOf(notFound)).toMatchObject({ error: "Sessão não encontrada", code: "NOT_FOUND" });

    login(["VOLUNTARIO"]);
    const forbidden = await sessionDelete(makeRequest("/api/work-sessions/1", { method: "DELETE" }), idContext("1"));
    expect(forbidden.status).toBe(403);
    expect(await bodyOf(forbidden)).toMatchObject({ error: "Não autorizado a excluir esta sessão", code: "FORBIDDEN" });

    login(["VOLUNTARIO"], 7); // o DONO exclui
    const ok = await sessionDelete(makeRequest("/api/work-sessions/1", { method: "DELETE" }), idContext("1"));
    expect(ok.status).toBe(200);
    expect((await bodyOf(ok)).success).toBe(true);
  });
});

describe("GET/POST /api/daily_logs + GET /api/daily_logs/[id]", () => {
  it("invalid userId/projectId params -> 400 (unchanged)", async () => {
    const badUser = await logsList(makeRequest("/api/daily_logs?userId=abc"));
    expect(badUser.status).toBe(400);
    const badProject = await logsList(makeRequest("/api/daily_logs?projectId=-1"));
    expect(badProject.status).toBe(400);
  });

  it("member read by non-privileged actor goes through the leader path (audit stays in the use case)", async () => {
    login(["VOLUNTARIO"]);
    mocks.logRows.push({ id: 2, userId: 8, projectId: 5, date: new Date(), note: null, workSessionId: null, createdAt: new Date(0) });
    mocks.led = [5];
    const response = await logsList(makeRequest("/api/daily_logs?userId=8"));
    expect(response.status).toBe(200);
    expect((await bodyOf(response)).logs.map((l: { id: number }) => l.id)).toEqual([2]);
    expect(mocks.audits).toHaveLength(1);

    mocks.led = [];
    const denied = await logsList(makeRequest("/api/daily_logs?userId=8"));
    expect(denied.status).toBe(403);
    expect(await bodyOf(denied)).toMatchObject({ error: "Acesso negado.", code: "FORBIDDEN" }); // COM PONTO — congelado
  });

  it("projectId read by non-privileged actor maps ForbiddenError to 403 typed body ('Acesso negado.')", async () => {
    login(["VOLUNTARIO"]);
    mocks.led = [5];
    const response = await logsList(makeRequest("/api/daily_logs?projectId=8"));
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toMatchObject({ error: "Acesso negado.", code: "FORBIDDEN" });
  });

  it("privileged actor (LABORATORISTA) reads all logs; non-privileged default reads own; POST is 410 deprecated", async () => {
    login(["LABORATORISTA"]);
    const response = await logsList(makeRequest("/api/daily_logs"));
    expect(response.status).toBe(200);
    expect((await bodyOf(response)).logs.map((l: { id: number }) => l.id)).toEqual([1]);

    login(["VOLUNTARIO"], 8);
    const own = await logsList(makeRequest("/api/daily_logs"));
    expect(own.status).toBe(200);
    expect((await bodyOf(own)).logs).toEqual([]);

    const deprecated = await logsCreate(makeRequest("/api/daily_logs", { method: "POST", body: {} }));
    expect(deprecated.status).toBe(410);
    expect((await bodyOf(deprecated)).deprecated).toBe(true);
  });

  it("log by id: missing -> 404 LEGADO {error}; LABORATORISTA bypass; owner ok; foreign -> 403 'Acesso negado'; PATCH/DELETE 410", async () => {
    const notFound = await logGet(makeRequest("/api/daily_logs/9"), idContext("9"));
    expect(notFound.status).toBe(404);
    expect(await bodyOf(notFound)).toEqual({ error: "Log não encontrado" }); // verbatim, sem code

    login(["LABORATORISTA"]);
    const asLab = await logGet(makeRequest("/api/daily_logs/1"), idContext("1"));
    expect(asLab.status).toBe(200);

    login(["VOLUNTARIO"], 7);
    const asOwner = await logGet(makeRequest("/api/daily_logs/1"), idContext("1"));
    expect(asOwner.status).toBe(200);

    login(["VOLUNTARIO"]);
    const denied = await logGet(makeRequest("/api/daily_logs/1"), idContext("1"));
    expect(denied.status).toBe(403);
    expect(await bodyOf(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });

    const patched = await logPatch(makeRequest("/api/daily_logs/1", { method: "PATCH", body: {} }), idContext("1"));
    expect(patched.status).toBe(410);
    const removed = await logDelete(makeRequest("/api/daily_logs/1", { method: "DELETE" }), idContext("1"));
    expect(removed.status).toBe(410);
  });
});
