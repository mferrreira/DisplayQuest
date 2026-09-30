// @vitest-environment node
/**
 * OND3-B3 (R4) — rota tests of app/api/work-sessions/* and app/api/daily_logs/*.
 *
 * Mocked seams: `@/backend/composition/root` (fake WorkExecutionModule) and
 * `@/lib/auth/api-guard`. The routes themselves are NOT mocked — these tests pin the HTTP
 * contract (AC-00-07): stable status for typed business conditions via domainErrorResponse,
 * route-level validations unchanged, frozen payload shapes, and the OND3-B3 dispatch change:
 * the PATCH "completion intent" heuristic is GONE — completion is dispatched on the explicit
 * status === "completed" only.
 *
 * Intentional status evolutions (documented in STATE 3.3):
 *   - POST start with invalid startTime / non-member projectId: 500 (message leaked in
 *     `details`) -> 400/403 typed, message in `error`.
 *   - PATCH/DELETE business errors (missing session raced, foreign project): 500 -> 404/403.
 *   - GET leader path: status 403 unchanged; body gains `code`/`details` (superset, DEC-16).
 *   - PATCH {endTime|projectId|dailyLogNote|completedTaskIds} WITHOUT status:"completed"
 *     no longer routes to completeWorkSession (goes to updateWorkSession).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain";

const mocks = vi.hoisted(() => {
  const fakeModule = {
    startWorkSession: async (command: Record<string, unknown>) => ({
      id: 100,
      userId: command.userId,
      userName: command.userName,
      startTime: "2026-06-15T11:00:00.000Z",
      endTime: null,
      duration: null,
      status: "active",
    }),
    completeWorkSession: async (command: Record<string, unknown>) => ({
      id: command.sessionId,
      userId: 7,
      userName: "Ana",
      startTime: "2026-06-15T10:00:00.000Z",
      endTime: "2026-06-15T11:00:00.000Z",
      duration: 3600,
      status: "completed",
    }),
    createDailyLogFromSession: async () => ({ id: 1 }),
    listWorkSessions: async () => [
      { id: 1, userId: 7, projectId: 5, status: "active" },
      { id: 2, userId: 8, projectId: 6, status: "active" },
    ],
    listDailyLogs: async () => [{ id: 1, userId: 7 }],
    listProjectLogsForLeader: async () => ({
      logs: [{ id: 1, userId: 8, projectId: 5 }],
      sessions: [{ id: 10, userId: 8, projectId: 5, status: "completed" }],
      ledProjectIds: [5],
    }),
    deleteWorkSession: async () => undefined,
    updateWorkSession: async (command: Record<string, unknown>) => ({
      id: command.sessionId,
      userId: 7,
      userName: "Ana",
      status: command.status ?? "active",
    }),
    getSessionById: async (id: number): Promise<{ id: number; userId: number; userName?: string; status: string } | null> =>
      ({ id, userId: 7, userName: "Ana", status: "active" }),
    getDailyLogById: async (id: number): Promise<{ id: number; userId: number } | null> => ({ id, userId: 7 }),
  };
  const auth = {
    actor: { id: 42, name: "Ana", roles: ["COORDENADOR"] } as { id: number; name: string; roles: string[] },
    selfOrPermissionError: null as unknown | null,
  };
  return { fakeModule, auth };
});

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({ workExecution: mocks.fakeModule }),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireApiActor: async () => ({ actor: mocks.auth.actor }),
  ensurePermission: () => null,
  ensureSelfOrPermission: () => mocks.auth.selfOrPermissionError,
}));

import { GET as sessionsList, POST as sessionsCreate } from "@/app/api/work-sessions/route";
import { DELETE as sessionDelete, PATCH as sessionPatch } from "@/app/api/work-sessions/[id]/route";
import { GET as logsList, POST as logsCreate } from "@/app/api/daily_logs/route";
import { GET as logGet, PATCH as logPatch, DELETE as logDelete } from "@/app/api/daily_logs/[id]/route";

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

beforeEach(() => {
  mocks.auth.actor = { id: 42, name: "Ana", roles: ["COORDENADOR"] };
  mocks.auth.selfOrPermissionError = null;
  mocks.fakeModule.startWorkSession = async (command: Record<string, unknown>) => ({
    id: 100,
    userId: command.userId,
    userName: command.userName,
    startTime: "2026-06-15T11:00:00.000Z",
    endTime: null,
    duration: null,
    status: "active",
  });
  mocks.fakeModule.completeWorkSession = async (command: Record<string, unknown>) => ({
    id: command.sessionId,
    userId: 7,
    userName: "Ana",
    startTime: "2026-06-15T10:00:00.000Z",
    endTime: "2026-06-15T11:00:00.000Z",
    duration: 3600,
    status: "completed",
  });
  mocks.fakeModule.listWorkSessions = async () => [
    { id: 1, userId: 7, projectId: 5, status: "active" },
    { id: 2, userId: 8, projectId: 6, status: "active" },
  ];
  mocks.fakeModule.listDailyLogs = async () => [{ id: 1, userId: 7 }];
  mocks.fakeModule.listProjectLogsForLeader = async () => ({
    logs: [{ id: 1, userId: 8, projectId: 5 }],
    sessions: [{ id: 10, userId: 8, projectId: 5, status: "completed" }],
    ledProjectIds: [5],
  });
  mocks.fakeModule.updateWorkSession = async (command: Record<string, unknown>) => ({
    id: command.sessionId,
    userId: 7,
    userName: "Ana",
    status: command.status ?? "active",
  });
  mocks.fakeModule.getSessionById = async (id: number) => ({ id, userId: 7, userName: "Ana", status: "active" });
  mocks.fakeModule.getDailyLogById = async (id: number) => ({ id, userId: 7 });
});

describe("GET /api/work-sessions", () => {
  it("projectId invalid -> 400 (route validation unchanged)", async () => {
    const response = await sessionsList(makeRequest("/api/work-sessions?projectId=abc"));
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toBe("projectId inválido");
  });

  it("projectId + non-manager leader path: empty scope -> 403; scoped sessions returned", async () => {
    mocks.auth.actor = { id: 42, name: "Ana", roles: ["VOLUNTARIO"] };
    mocks.fakeModule.listProjectLogsForLeader = async () => ({ logs: [], sessions: [], ledProjectIds: [] });
    const denied = await sessionsList(makeRequest("/api/work-sessions?projectId=5"));
    expect(denied.status).toBe(403);

    mocks.fakeModule.listProjectLogsForLeader = async () => ({
      logs: [],
      sessions: [
        { id: 10, userId: 8, projectId: 5, status: "completed" },
        { id: 11, userId: 9, projectId: 5, status: "completed" },
      ],
      ledProjectIds: [5],
    });
    const ok = await sessionsList(makeRequest("/api/work-sessions?projectId=5&userId=8"));
    expect(ok.status).toBe(200);
    expect((await bodyOf(ok)).data.map((s: { id: number }) => s.id)).toEqual([10]);
  });

  it("leader path maps ForbiddenError to 403 typed body (superset, DEC-16)", async () => {
    mocks.auth.actor = { id: 42, name: "Ana", roles: ["VOLUNTARIO"] };
    mocks.fakeModule.listProjectLogsForLeader = async () => {
      throw new ForbiddenError("Acesso negado");
    };
    const response = await sessionsList(makeRequest("/api/work-sessions?projectId=8"));
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("manager: projectId filter client-side; active=true -> status query; default -> own sessions for non-managers", async () => {
    const byProject = await sessionsList(makeRequest("/api/work-sessions?projectId=5"));
    expect((await bodyOf(byProject)).data.map((s: { id: number }) => s.id)).toEqual([1]);

    const active = await sessionsList(makeRequest("/api/work-sessions?active=true"));
    expect(active.status).toBe(200);

    mocks.auth.actor = { id: 42, name: "Ana", roles: ["VOLUNTARIO"] };
    const own = await sessionsList(makeRequest("/api/work-sessions"));
    expect(own.status).toBe(200);
  });

  it("ensureSelfOrPermission error passes through; unknown error stays 500", async () => {
    mocks.auth.actor = { id: 42, name: "Ana", roles: ["VOLUNTARIO"] };
    mocks.auth.selfOrPermissionError = new Response(JSON.stringify({ error: "sem acesso" }), { status: 403 });
    const blocked = await sessionsList(makeRequest("/api/work-sessions?userId=9"));
    expect(blocked.status).toBe(403);

    mocks.auth.selfOrPermissionError = null;
    mocks.fakeModule.listWorkSessions = async () => {
      throw new Error("db down");
    };
    const failed = await sessionsList(makeRequest("/api/work-sessions"));
    expect(failed.status).toBe(500);
  });

  it("typed ValidationError from the module maps to 400 (evolution from 500)", async () => {
    mocks.fakeModule.listWorkSessions = async () => {
      throw new ValidationError("Consulta de sessões inválida");
    };
    const response = await sessionsList(makeRequest("/api/work-sessions?status=active"));
    expect(response.status).toBe(400);
    expect((await bodyOf(response)).error).toBe("Consulta de sessões inválida");
  });
});

describe("POST /api/work-sessions", () => {
  it("userId invalid -> 400; happy path -> 201 with the created session", async () => {
    const invalid = await sessionsCreate(makeRequest("/api/work-sessions", { method: "POST", body: { userId: "abc" } }));
    expect(invalid.status).toBe(400);

    const created = await sessionsCreate(
      makeRequest("/api/work-sessions", { method: "POST", body: { userId: 7, userName: "Ana", activity: "Lab" } }),
    );
    expect(created.status).toBe(201);
    expect((await bodyOf(created)).data.status).toBe("active");
  });

  it("status=completed + endTime completes on create (manual entry flow) -> 201 completed", async () => {
    const response = await sessionsCreate(
      makeRequest("/api/work-sessions", {
        method: "POST",
        body: { userId: 7, userName: "Ana", status: "completed", endTime: "2026-06-15T11:00:00.000Z", projectId: 5 },
      }),
    );
    expect(response.status).toBe(201);
    expect((await bodyOf(response)).data.status).toBe("completed");
  });

  it("typed errors map: membership 403 and invalid startTime 400 (evolution from 500-with-details)", async () => {
    mocks.fakeModule.startWorkSession = async () => {
      throw new ForbiddenError("Usuário não é membro do projeto informado");
    };
    const forbidden = await sessionsCreate(
      makeRequest("/api/work-sessions", { method: "POST", body: { userId: 7, userName: "Ana", projectId: 5 } }),
    );
    expect(forbidden.status).toBe(403);
    expect((await bodyOf(forbidden)).code).toBe("FORBIDDEN");

    mocks.fakeModule.startWorkSession = async () => {
      throw new ValidationError("startTime inválido");
    };
    const invalid = await sessionsCreate(
      makeRequest("/api/work-sessions", { method: "POST", body: { userId: 7, userName: "Ana", startTime: "x" } }),
    );
    expect(invalid.status).toBe(400);
    expect((await bodyOf(invalid)).error).toBe("startTime inválido");
  });
});

describe("PATCH /api/work-sessions/[id] — dispatch by explicit status (completion intent removed)", () => {
  it("missing session -> 404; access error passes through", async () => {
    mocks.fakeModule.getSessionById = async () => null;
    const response = await sessionPatch(makeRequest("/api/work-sessions/9", { method: "PATCH", body: { status: "paused" } }), idContext("9"));
    expect(response.status).toBe(404);
    expect((await bodyOf(response)).error).toBe("Sessão não encontrada");

    mocks.fakeModule.getSessionById = async (id: number) => ({ id, userId: 7, userName: "Ana", status: "active" });
    mocks.auth.selfOrPermissionError = new Response(JSON.stringify({ error: "sem acesso" }), { status: 403 });
    const blocked = await sessionPatch(makeRequest("/api/work-sessions/1", { method: "PATCH", body: { status: "paused" } }), idContext("1"));
    expect(blocked.status).toBe(403);
  });

  it("status=completed routes to completeWorkSession (log + events path preserved)", async () => {
    const completeSpy = vi.spyOn(mocks.fakeModule, "completeWorkSession");
    const updateSpy = vi.spyOn(mocks.fakeModule, "updateWorkSession");

    const response = await sessionPatch(
      makeRequest("/api/work-sessions/1", { method: "PATCH", body: { status: "completed", dailyLogNote: "ok" } }),
      idContext("1"),
    );
    expect(response.status).toBe(200);
    expect((await bodyOf(response)).data.status).toBe("completed");
    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("status=paused routes to updateWorkSession (pause math stays server-side)", async () => {
    const completeSpy = vi.spyOn(mocks.fakeModule, "completeWorkSession");
    const updateSpy = vi.spyOn(mocks.fakeModule, "updateWorkSession");

    const response = await sessionPatch(makeRequest("/api/work-sessions/1", { method: "PATCH", body: { status: "paused" } }), idContext("1"));
    expect(response.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it("EVOLUTION: endTime/dailyLogNote WITHOUT status no longer triggers completeWorkSession", async () => {
    const completeSpy = vi.spyOn(mocks.fakeModule, "completeWorkSession");
    const updateSpy = vi.spyOn(mocks.fakeModule, "updateWorkSession");

    const response = await sessionPatch(
      makeRequest("/api/work-sessions/1", {
        method: "PATCH",
        body: { endTime: "2026-06-15T11:00:00.000Z", dailyLogNote: "x", projectId: 5 },
      }),
      idContext("1"),
    );
    expect(response.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it("typed module errors map: NotFound 404, Forbidden 403, Validation 400 (evolution from 500)", async () => {
    mocks.fakeModule.updateWorkSession = async () => {
      throw new NotFoundError("Sessão não encontrada");
    };
    const notFound = await sessionPatch(makeRequest("/api/work-sessions/1", { method: "PATCH", body: { status: "paused" } }), idContext("1"));
    expect(notFound.status).toBe(404);

    mocks.fakeModule.updateWorkSession = async () => {
      throw new ForbiddenError("Não autorizado a atualizar esta sessão");
    };
    const forbidden = await sessionPatch(makeRequest("/api/work-sessions/1", { method: "PATCH", body: { status: "paused" } }), idContext("1"));
    expect(forbidden.status).toBe(403);

    mocks.fakeModule.updateWorkSession = async () => {
      throw new ValidationError("Só é possível vincular tasks em sessões finalizadas");
    };
    const invalid = await sessionPatch(
      makeRequest("/api/work-sessions/1", { method: "PATCH", body: { completedTaskIds: [10] } }),
      idContext("1"),
    );
    expect(invalid.status).toBe(400);
    expect((await bodyOf(invalid)).error).toBe("Só é possível vincular tasks em sessões finalizadas");
  });
});

describe("DELETE /api/work-sessions/[id]", () => {
  it("missing -> 404; happy -> 200 {success:true}; Forbidden maps 403 (evolution from 500)", async () => {
    mocks.fakeModule.getSessionById = async () => null;
    const notFound = await sessionDelete(makeRequest("/api/work-sessions/9", { method: "DELETE" }), idContext("9"));
    expect(notFound.status).toBe(404);

    mocks.fakeModule.getSessionById = async (id: number) => ({ id, userId: 7, status: "active" });
    const ok = await sessionDelete(makeRequest("/api/work-sessions/1", { method: "DELETE" }), idContext("1"));
    expect(ok.status).toBe(200);
    expect((await bodyOf(ok)).success).toBe(true);

    mocks.fakeModule.deleteWorkSession = async () => {
      throw new ForbiddenError("Não autorizado a excluir esta sessão");
    };
    const forbidden = await sessionDelete(makeRequest("/api/work-sessions/1", { method: "DELETE" }), idContext("1"));
    expect(forbidden.status).toBe(403);
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
    mocks.auth.actor = { id: 42, name: "Ana", roles: ["VOLUNTARIO"] };
    const response = await logsList(makeRequest("/api/daily_logs?userId=8"));
    expect(response.status).toBe(200);
    expect((await bodyOf(response)).logs.map((l: { id: number }) => l.id)).toEqual([1]);

    mocks.fakeModule.listProjectLogsForLeader = async () => ({ logs: [], sessions: [], ledProjectIds: [] });
    const denied = await logsList(makeRequest("/api/daily_logs?userId=8"));
    expect(denied.status).toBe(403);
  });

  it("projectId read by non-privileged actor maps ForbiddenError to 403 typed body", async () => {
    mocks.auth.actor = { id: 42, name: "Ana", roles: ["VOLUNTARIO"] };
    mocks.fakeModule.listProjectLogsForLeader = async () => {
      throw new ForbiddenError("Acesso negado");
    };
    const response = await logsList(makeRequest("/api/daily_logs?projectId=8"));
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("privileged actor (LABORATORISTA) reads all logs; POST is 410 deprecated", async () => {
    mocks.auth.actor = { id: 42, name: "Ana", roles: ["LABORATORISTA"] };
    const response = await logsList(makeRequest("/api/daily_logs"));
    expect(response.status).toBe(200);

    const deprecated = await logsCreate(makeRequest("/api/daily_logs", { method: "POST", body: {} }));
    expect(deprecated.status).toBe(410);
    expect((await bodyOf(deprecated)).deprecated).toBe(true);
  });

  it("log by id: missing -> 404; LABORATORISTA bypass; owner ok; PATCH/DELETE 410", async () => {
    mocks.fakeModule.getDailyLogById = async () => null;
    const notFound = await logGet(makeRequest("/api/daily_logs/9"), idContext("9"));
    expect(notFound.status).toBe(404);

    mocks.fakeModule.getDailyLogById = async (id: number) => ({ id, userId: 8 });
    mocks.auth.actor = { id: 42, name: "Ana", roles: ["LABORATORISTA"] };
    const asLab = await logGet(makeRequest("/api/daily_logs/1"), idContext("1"));
    expect(asLab.status).toBe(200);

    mocks.auth.actor = { id: 42, name: "Ana", roles: ["VOLUNTARIO"] };
    mocks.fakeModule.getDailyLogById = async (id: number) => ({ id, userId: 42 });
    const asOwner = await logGet(makeRequest("/api/daily_logs/1"), idContext("1"));
    expect(asOwner.status).toBe(200);

    const patched = await logPatch(makeRequest("/api/daily_logs/1", { method: "PATCH", body: {} }), idContext("1"));
    expect(patched.status).toBe(410);
    const removed = await logDelete(makeRequest("/api/daily_logs/1", { method: "DELETE" }), idContext("1"));
    expect(removed.status).toBe(410);
  });
});
