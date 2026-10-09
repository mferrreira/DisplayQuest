// @vitest-environment node
/**
 * OND7-B4 (R4) — rota tests das rotas de reporting (weekly-reports/*, project-reports/*,
 * attachments/[id], weekly-hours-history, report-files/[...path], projects/{stats,[id]/hours,
 * [id]/weekly-hours, [id]/hours-history}, users/[id]/project-hours).
 *
 * Seams mockados: `@/backend/composition/root` (fake ReportingModule + canActorAccessProject),
 * `@/lib/auth/api-guard`, `@/lib/auth/rbac` e `@/lib/storage/report-uploads` (seam da casa).
 * As rotas NÃO são mockadas — pinam o contrato HTTP (AC-00-07): status estável para erros
 * tipados via domainErrorResponse, validações de rota congeladas, shapes de payload congelados.
 *
 * Evoluções de status documentadas (STATE 7.4) — mensagens verbatim do contract OND7-B3:
 *   - POST /weekly-reports e /weekly-reports/generate: "Usuário não encontrado" 500 -> 404.
 *   - Rotas que já mapeavam por mensagem (project-reports*, attachments/[id], export.csv,
 *     report-files): MESMOS status (403/404/400), agora tipados; corpo passa a ser
 *     superset {error, code, details}.
 *   - weekly-reports/[id] DELETE: P2025 (não-DomainError) mantém 500 com mensagem fixa
 *     legado (não vaza message) — congelado.
 *   Não-DomainError: fallback 500 legado preservado verbatim em todas as rotas.
 *
 * B6-3 (D4): os gates de weekly-reports/historico de horas/estatisticas desceram para os
 * use cases. Este arquivo e o contrato HTTP+MAPPER (mantem o duplo de modulo), e o duplo
 * passou a DELEGAR nas funcoes do dominio que os use cases chamam (padrao DEC-90) — a
 * negacao por papel e exercitada pela MATRIZ REAL via papeis do ator (`login([...])`), nao
 * por estado de mock rbac. Autorizacao com o MODULO REAL: reporting-authorization.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  canViewWeeklyReports,
  ForbiddenError,
  NotFoundError,
  requireActorPermission,
  requireActorSelfOrPermission,
  requireWeeklyReportSelfOrView,
  ValidationError,
  type ActorRef,
} from "@/backend/domain";
import { WEEKLY_HOURS_DENIED_MESSAGE } from "@/backend/modules/reporting/application/use-cases/list-weekly-hours-history.use-case";

const mocks = vi.hoisted(() => {
  const state = {
    throwKind: null as null | "forbidden" | "notfound" | "notfound-user" | "validation" | "plain" | "p2025",
    projectAccess: true,
    fileBytes: null as Uint8Array | null,
    absPath: null as string | null,
    calls: [] as Array<{ method: string; arg: unknown }>,
  };
  const record = (method: string, arg?: unknown) => {
    state.calls.push({ method, arg });
    if (state.throwKind === "forbidden") throw new ForbiddenError("Acesso negado");
    if (state.throwKind === "notfound") throw new NotFoundError("Relatório não encontrado");
    if (state.throwKind === "notfound-user") throw new NotFoundError("Usuário não encontrado");
    if (state.throwKind === "validation") throw new ValidationError("Dados inválidos: periodicidade inválida");
    if (state.throwKind === "plain") throw new Error("db down");
    if (state.throwKind === "p2025") throw new Error("Record not found: WeeklyReport 5");
  };
  const fakeModule = {
    // B6-3 (D4): os gates das rotas de weekly-reports/historico/estatisticas desceram para os
    // use cases. Este duplo nao reimplementa a regra — ele DELEGA nas MESMAS funcoes do
    // dominio que os use cases chamam (padrao DEC-90, o mesmo do gamification-routes e dos
    // handlers MSW): assim o teste continua provando a rota + o mapper sobre a regra real,
    // e a decisao deixa de vir do estado do mock rbac. A autorizacao por papel em si e
    // provada com o MODULO REAL em reporting-authorization.test.ts.
    listWeeklyReports: async (query: { actor: ActorRef; userId?: number }) => {
      let effectiveUserId = query.userId;
      if (effectiveUserId !== undefined) {
        requireWeeklyReportSelfOrView(query.actor, effectiveUserId);
      } else if (!canViewWeeklyReports(query.actor)) {
        effectiveUserId = query.actor.kind === "user" ? query.actor.id : undefined;
      }
      record("listWeeklyReports", { userId: effectiveUserId });
      return [{ id: 1, userId: 42 }];
    },
    upsertWeeklyReport: async (command: { actor: ActorRef; userId: number }) => {
      requireWeeklyReportSelfOrView(command.actor, command.userId);
      record("upsertWeeklyReport", command);
      if (state.throwKind === "notfound-user") throw new NotFoundError("Usuário não encontrado");
      if (state.throwKind === "plain") throw new Error("db down");
      return { id: 7, userId: 42, summary: null };
    },
    generateWeeklyReport: async (command: { actor: ActorRef; userId: number }) => {
      // Gate DIFERENTE do POST irmao: self || MANAGE_USERS puro (LABORATORISTA nao cria para
      // terceiro por aqui) — a diferenca medida que virou GenerateWeeklyReportUseCase.
      requireActorSelfOrPermission(command.actor, command.userId, "MANAGE_USERS");
      record("generateWeeklyReport", command);
      if (state.throwKind === "notfound-user") throw new NotFoundError("Usuário não encontrado");
      return { id: 8, userId: command.userId, summary: null };
    },
    getWeeklyReportById: async (actor: ActorRef, id: number) => {
      if (id === 999) return null;
      const report = { id, userId: id === 2 ? 7 : 42 };
      requireWeeklyReportSelfOrView(actor, report.userId);
      return report;
    },
    deleteWeeklyReport: async (actor: ActorRef, id: number) => {
      requireWeeklyReportSelfOrView(actor, id === 2 ? 7 : 42);
      record("deleteWeeklyReport", id);
    },
    assertCanManageWeeklyHours: (command: { actor: ActorRef }) => {
      requireActorPermission(command.actor, "MANAGE_USERS", WEEKLY_HOURS_DENIED_MESSAGE);
    },
    deleteReportAttachment: async (arg: unknown) => {
      record("deleteReportAttachment", arg);
    },
    getWeeklyHoursStats: async (actor: ActorRef) => {
      requireActorPermission(actor, "MANAGE_USERS", WEEKLY_HOURS_DENIED_MESSAGE);
      return {
        currentWeek: { totalHours: 10, topUsers: [] },
        last4Weeks: [],
      };
    },
    listWeeklyHoursHistory: async (query: { actor: ActorRef }) => {
      requireActorPermission(query.actor, "MANAGE_USERS", WEEKLY_HOURS_DENIED_MESSAGE);
      record("listWeeklyHoursHistory", query);
      return [{ id: 1, userId: 2, totalHours: 3 }];
    },
    resetWeeklyHoursHistory: async (actor: ActorRef) => {
      requireActorPermission(actor, "MANAGE_USERS", WEEKLY_HOURS_DENIED_MESSAGE);
      return [{ userId: 1, savedHours: "0" }];
    },
    createWeeklyHoursHistory: async (actor: ActorRef, weekStart: string) => {
      requireActorPermission(actor, "MANAGE_USERS", WEEKLY_HOURS_DENIED_MESSAGE);
      record("createWeeklyHoursHistory", weekStart);
      return [{ userId: 1, totalHours: 1 }];
    },
    sweepStaleReportUploads: async () => {
      state.calls.push({ method: "sweepStaleReportUploads", arg: null });
      return { removed: 0 };
    },
    listProjectReports: async (arg: unknown) => {
      record("listProjectReports", arg);
      return [{ id: 1, projectId: 10 }];
    },
    createProjectReport: async (arg: unknown) => {
      record("createProjectReport", arg);
      return { report: { id: 10, projectId: 10 }, created: true };
    },
    registerReportAttachment: async (arg: unknown) => {
      record("registerReportAttachment", arg);
      return { id: 10, attachments: [{ id: 3 }] };
    },
    getProjectReport: async (_actorId: number, _roles: unknown, id: number) => {
      if (state.throwKind === "forbidden") throw new ForbiddenError("Acesso negado");
      return id === 999 ? null : { id, projectName: "P" };
    },
    updateProjectReport: async (arg: unknown) => {
      record("updateProjectReport", arg);
      return { id: 10, content: "novo" };
    },
    deleteProjectReport: async (arg: unknown) => {
      record("deleteProjectReport", arg);
    },
    aggregateProjectReport: async (_actorId: number, _roles: unknown, id: number) => {
      record("aggregateProjectReport", id);
      return {
        report: {
          id,
          title: "T",
          projectName: "Projeto X",
          authorName: "Ana",
          periodLabel: "setembro/2026",
          periodStart: "2026-09-01T03:00:00.000Z",
          periodEnd: "2026-10-01T02:59:59.999Z",
          content: "Conteúdo",
        },
        logs: [{ userName: "Ana", date: "2026-09-10T12:00:00.000Z", startTime: null, endTime: null, note: "nota" }],
        sessions: [
          {
            userName: "Ana",
            startTime: "2026-09-10T12:00:00.000Z",
            endTime: "2026-09-10T14:00:00.000Z",
            durationHours: 2,
            activity: "Atividade",
            location: "Lab",
          },
        ],
        totals: { sessionCount: 1, totalHours: 2, logCount: 1 },
      };
    },
    getUserProjectHours: async (arg: unknown) => {
      record("getUserProjectHours", arg);
      return [{ projectId: 10, hours: 5 }];
    },
    getProjectStats: async (actor: ActorRef) => {
      requireActorPermission(actor, "MANAGE_USERS", "Apenas coordenadores e gerentes podem acessar estatísticas gerais");
      return { totalProjects: 3 };
    },
    getProjectHours: async (arg: unknown) => {
      record("getProjectHours", arg);
      return [{ userId: 1, hours: 2 }];
    },
    getProjectWeeklyHours: async (projectId: number, weekStart: string) => ({ projectId, weekStart, totalHours: 4 }),
    getProjectHoursHistory: async (arg: unknown) => {
      record("getProjectHoursHistory", arg);
      return [{ month: "2026-09", totalHours: 9 }];
    },
  };
  const auth = {
    actor: { id: 42, name: "Ana", roles: ["COORDENADOR"] } as { id: number; name: string; roles: string[] },
  };
  return { fakeModule, auth, state };
});

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({
    reporting: mocks.fakeModule,
    projectManagement: {
      canActorAccessProject: async () => mocks.state.projectAccess,
    },
  }),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireApiActor: async () => ({ actor: mocks.auth.actor }),
  ensurePermission: () => null,
  ensureSelfOrPermission: () => null,
}));

// B6-3: o mock de `@/lib/auth/rbac` saiu — nenhuma rota deste arquivo importa rbac desde que
// os gates desceram para os use cases (a decisao agora e a matriz real, exercitada pelos duplos
// que delegam em requireWeeklyReportSelfOrView/requireActorPermission). Se uma rota voltar a
// importar rbac, o teste falha alto em vez de receber `true` de graca.

vi.mock("@/lib/storage/report-uploads", () => ({
  validateReportFile: async () => ({ ok: true }),
  storeReportFile: async (reportId: number, file: File) => ({
    storedPath: `uploads/reports/${reportId}/${file.name}`,
  }),
  sanitizeDisplayName: (name: string) => name,
  removeStoredReportFile: async () => undefined,
  absolutePathOf: (storedPath: string) => mocks.state.absPath ?? (storedPath ? `/app/data/${storedPath}` : null),
  readReportFileBytes: async () => mocks.state.fileBytes,
}));

import { GET as weeklyList, POST as weeklyUpsert } from "@/app/api/weekly-reports/route";
import { DELETE as weeklyDelete, GET as weeklyGet } from "@/app/api/weekly-reports/[id]/route";
import { POST as weeklyGenerate } from "@/app/api/weekly-reports/generate/route";
import { DELETE as attachmentDelete } from "@/app/api/attachments/[id]/route";
import { GET as hoursHistoryGet, POST as hoursHistoryPost } from "@/app/api/weekly-hours-history/route";
import { GET as projectReportsList, POST as projectReportsCreate } from "@/app/api/project-reports/route";
import { DELETE as projectReportDelete, GET as projectReportGet, PUT as projectReportUpdate } from "@/app/api/project-reports/[id]/route";
import { GET as projectReportAggregate } from "@/app/api/project-reports/[id]/aggregate/route";
import { POST as projectReportAttach } from "@/app/api/project-reports/[id]/attachments/route";
import { GET as projectReportCsv } from "@/app/api/project-reports/[id]/export.csv/route";
import { GET as reportFileGet } from "@/app/api/report-files/[...path]/route";
import { GET as userProjectHours } from "@/app/api/users/[id]/project-hours/route";
import { GET as projectsStats } from "@/app/api/projects/stats/route";
import { GET as projectHours } from "@/app/api/projects/[id]/hours/route";
import { GET as projectWeeklyHours } from "@/app/api/projects/[id]/weekly-hours/route";
import { GET as projectHoursHistory } from "@/app/api/projects/[id]/hours-history/route";

function makeRequest(path: string, init?: { method?: string; body?: unknown; formData?: FormData }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    body: init?.formData ?? (init?.body !== undefined ? JSON.stringify(init.body) : undefined),
    headers: init?.formData ? undefined : { "content-type": "application/json" },
  });
}

function params<T extends Record<string, string | string[]>>(values: T) {
  return { params: Promise.resolve(values) };
}

async function bodyOf(response: Response) {
  return await response.json();
}

beforeEach(() => {
  mocks.state.throwKind = null;
  mocks.state.projectAccess = true;
  mocks.state.fileBytes = null;
  mocks.state.absPath = null;
  mocks.state.calls = [];
  mocks.auth.actor.roles = ["COORDENADOR"];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** B6-3: a negacao agora vem dos PAPEIS do ator (matriz real), nao do estado do mock rbac. */
function login(roles: string[]) {
  mocks.auth.actor.roles = roles;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET/POST /api/weekly-reports", () => {
  it("GET lista (shape { weeklyReports }); sem permissão vê só os próprios (userId=actor)", async () => {
    login(["VOLUNTARIO"]);
    const response = await weeklyList(makeRequest("/api/weekly-reports"));
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({ weeklyReports: [{ id: 1, userId: 42 }] });
    // B6-3: a resolução de escopo (userId=actor para quem não vê todos) agora é do use case —
    // o duplo delega na mesma regra e registra o userId efetivo.
    expect(mocks.state.calls[0]).toMatchObject({ method: "listWeeklyReports", arg: { userId: 42 } });
  });

  it("GET userId inválido => 400; userId de outro sem permissão => 403 (congelado)", async () => {
    const invalid = await weeklyList(makeRequest("/api/weekly-reports?userId=abc"));
    expect(invalid.status).toBe(400);
    expect(await bodyOf(invalid)).toEqual({ error: "userId inválido" });

    login(["VOLUNTARIO"]);
    const denied = await weeklyList(makeRequest("/api/weekly-reports?userId=7"));
    expect(denied.status).toBe(403);
    // B6-3 (DEC-53): gate migrado — corpo superset, mensagem "Sem permissão" intacta.
    expect(await bodyOf(denied)).toMatchObject({ error: "Sem permissão", code: "FORBIDDEN" });
  });

  it("GET erro nao-DomainError mantem 500 com mensagem fixa legado", async () => {
    mocks.state.throwKind = "plain";
    const response = await weeklyList(makeRequest("/api/weekly-reports"));
    expect(response.status).toBe(500);
    expect(await bodyOf(response)).toEqual({ error: "Erro ao buscar relatórios semanais" });
  });

  it("POST valido => 201 { weeklyReport }", async () => {
    const response = await weeklyUpsert(
      makeRequest("/api/weekly-reports", { method: "POST", body: { userId: 42, weekStart: "2026-09-14T03:00:00.000Z", weekEnd: "2026-09-21T02:59:59.999Z" } }),
    );
    expect(response.status).toBe(201);
    expect(await bodyOf(response)).toEqual({ data: { weeklyReport: { id: 7, userId: 42, summary: null } } });
  });

  it("EVOLUTION: POST 'Usuário não encontrado' => 404 tipado (antes 500 com message)", async () => {
    mocks.state.throwKind = "notfound-user";
    const response = await weeklyUpsert(
      makeRequest("/api/weekly-reports", { method: "POST", body: { userId: 999, weekStart: "a", weekEnd: "b" } }),
    );
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toMatchObject({ error: "Usuário não encontrado", code: "NOT_FOUND" });
  });

  it("POST erro nao-DomainError mantem 500 com message legado", async () => {
    mocks.state.throwKind = "plain";
    const response = await weeklyUpsert(
      makeRequest("/api/weekly-reports", { method: "POST", body: { userId: 42, weekStart: "a", weekEnd: "b" } }),
    );
    expect(response.status).toBe(500);
    expect(await bodyOf(response)).toEqual({ error: "db down" });
  });
});

describe("GET/DELETE /api/weekly-reports/[id]", () => {
  it("GET id invalido => 400 'ID inválido' (congelado)", async () => {
    const response = await weeklyGet(makeRequest("/api/weekly-reports/abc"), params({ id: "abc" }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "ID inválido" });
  });

  it("GET inexistente => 404 manual legado; dono => 200 { weeklyReport }", async () => {
    const missing = await weeklyGet(makeRequest("/api/weekly-reports/999"), params({ id: "999" }));
    expect(missing.status).toBe(404);
    expect(await bodyOf(missing)).toEqual({ error: "Relatório não encontrado" });

    const ok = await weeklyGet(makeRequest("/api/weekly-reports/1"), params({ id: "1" }));
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toEqual({ data: { weeklyReport: { id: 1, userId: 42 } } });
  });

  it("GET nao-dono sem permissão => 403 'Sem permissão' (congelado)", async () => {
    login(["VOLUNTARIO"]);
    const response = await weeklyGet(makeRequest("/api/weekly-reports/2"), params({ id: "2" }));
    expect(response.status).toBe(403);
    // B6-3 (DEC-53): corpo superset, mensagem intacta.
    expect(await bodyOf(response)).toMatchObject({ error: "Sem permissão", code: "FORBIDDEN" });
  });

  it("DELETE valido => { success: true } (dono pode, mesmo sem gestão)", async () => {
    login(["VOLUNTARIO"]);
    const ok = await weeklyDelete(makeRequest("/api/weekly-reports/1", { method: "DELETE" }), params({ id: "1" }));
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toEqual({ data: { success: true } });
  });

  it("CONGELADO: DELETE P2025 (nao-DomainError) => 500 com mensagem fixa (message nao vaza)", async () => {
    mocks.state.throwKind = "p2025";
    const response = await weeklyDelete(makeRequest("/api/weekly-reports/5", { method: "DELETE" }), params({ id: "5" }));
    expect(response.status).toBe(500);
    expect(await bodyOf(response)).toEqual({ error: "Erro ao deletar relatório semanal" });
  });
});

describe("POST /api/weekly-reports/generate", () => {
  it("campos faltando => 400 congelado", async () => {
    const response = await weeklyGenerate(makeRequest("/api/weekly-reports/generate", { method: "POST", body: { userId: 42 } }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "userId, weekStart e weekEnd são obrigatórios" });
  });

  it("EVOLUTION: 'Usuário não encontrado' => 404 tipado (antes 500 com message)", async () => {
    mocks.state.throwKind = "notfound-user";
    const response = await weeklyGenerate(
      makeRequest("/api/weekly-reports/generate", { method: "POST", body: { userId: 999, weekStart: "a", weekEnd: "b" } }),
    );
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toMatchObject({ error: "Usuário não encontrado", code: "NOT_FOUND" });
  });
});

describe("DELETE /api/attachments/[id]", () => {
  it("id invalido => 400 'id inválido' (congelado)", async () => {
    const response = await attachmentDelete(makeRequest("/api/attachments/x", { method: "DELETE" }), params({ id: "x" }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "id inválido" });
  });

  it("'Acesso negado' => 403 tipado (mesmo status do mapeamento legado por mensagem)", async () => {
    mocks.state.throwKind = "forbidden";
    const response = await attachmentDelete(makeRequest("/api/attachments/3", { method: "DELETE" }), params({ id: "3" }));
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("'Anexo não encontrado' legado: rota mapeia 'não encontrado' -> 404; aqui NotFoundError tipado => 404", async () => {
    mocks.state.throwKind = "notfound";
    const response = await attachmentDelete(makeRequest("/api/attachments/3", { method: "DELETE" }), params({ id: "3" }));
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toMatchObject({ error: "Relatório não encontrado", code: "NOT_FOUND" });
  });

  it("nao-DomainError mantem 500 com message legado", async () => {
    mocks.state.throwKind = "plain";
    const response = await attachmentDelete(makeRequest("/api/attachments/3", { method: "DELETE" }), params({ id: "3" }));
    expect(response.status).toBe(500);
    expect(await bodyOf(response)).toEqual({ error: "db down" });
  });
});

describe("GET/POST /api/weekly-hours-history", () => {
  it("GET stats=true => { stats }; lista => { history } (shapes congelados)", async () => {
    const stats = await hoursHistoryGet(makeRequest("/api/weekly-hours-history?stats=true"));
    expect(stats.status).toBe(200);
    expect(await bodyOf(stats)).toMatchObject({ stats: { currentWeek: { totalHours: 10 } } });

    const list = await hoursHistoryGet(makeRequest("/api/weekly-hours-history?weekStart=2026-09-16T12:00:00.000Z"));
    expect(list.status).toBe(200);
    expect(await bodyOf(list)).toEqual({ history: [{ id: 1, userId: 2, totalHours: 3 }] });
  });

  it("GET userId invalido => 400 congelado; nao-DomainError => 500 com message", async () => {
    const invalid = await hoursHistoryGet(makeRequest("/api/weekly-hours-history?userId=abc"));
    expect(invalid.status).toBe(400);
    expect(await bodyOf(invalid)).toEqual({ error: "userId inválido" });

    mocks.state.throwKind = "plain";
    const down = await hoursHistoryGet(makeRequest("/api/weekly-hours-history"));
    expect(down.status).toBe(500);
    expect(await bodyOf(down)).toEqual({ error: "db down" });
  });

  it("POST reset => { message, results }; create_week_history sem weekStart => 400; ação desconhecida => 400 (congelados)", async () => {
    const reset = await hoursHistoryPost(makeRequest("/api/weekly-hours-history", { method: "POST", body: { action: "reset" } }));
    expect(reset.status).toBe(200);
    expect(await bodyOf(reset)).toEqual({ message: "Horas semanais resetadas com sucesso", results: [{ userId: 1, savedHours: "0" }] });

    const missing = await hoursHistoryPost(makeRequest("/api/weekly-hours-history", { method: "POST", body: { action: "create_week_history" } }));
    expect(missing.status).toBe(400);
    expect(await bodyOf(missing)).toEqual({ error: "weekStart é obrigatório" });

    const unknown = await hoursHistoryPost(makeRequest("/api/weekly-hours-history", { method: "POST", body: { action: "nope" } }));
    expect(unknown.status).toBe(400);
    expect(await bodyOf(unknown)).toEqual({ error: "Ação não reconhecida" });
  });

  it("POST create_week_history valido => { message, results } (weekStart repassado)", async () => {
    const response = await hoursHistoryPost(
      makeRequest("/api/weekly-hours-history", { method: "POST", body: { action: "create_week_history", weekStart: "2026-09-02T12:00:00.000Z" } }),
    );
    expect(response.status).toBe(200);
    expect(mocks.state.calls.some((c) => c.method === "createWeeklyHoursHistory" && c.arg === "2026-09-02T12:00:00.000Z")).toBe(true);
  });
});

describe("GET/POST /api/project-reports", () => {
  it("GET 'Acesso negado' => 403 tipado (mesmo status legado por mensagem)", async () => {
    mocks.state.throwKind = "forbidden";
    const response = await projectReportsList(makeRequest("/api/project-reports"));
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("GET projectId/authorId/periodType invalidos => 400 congelados", async () => {
    const badProject = await projectReportsList(makeRequest("/api/project-reports?projectId=abc"));
    expect(badProject.status).toBe(400);
    expect(await bodyOf(badProject)).toEqual({ error: "projectId inválido" });

    const badPeriod = await projectReportsList(makeRequest("/api/project-reports?periodType=diario"));
    expect(badPeriod.status).toBe(400);
    expect(await bodyOf(badPeriod)).toEqual({ error: "periodType inválido" });
  });

  it("GET valido => { projectReports }; sweep lazy chamado; nao-DomainError => 500 com message", async () => {
    const ok = await projectReportsList(makeRequest("/api/project-reports?projectId=10&from=2026-09-01&to=2026-09-30"));
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toEqual({ projectReports: [{ id: 1, projectId: 10 }] });
    expect(mocks.state.calls.some((c) => c.method === "sweepStaleReportUploads")).toBe(true);
    expect(mocks.state.calls.find((c) => c.method === "listProjectReports")?.arg).toMatchObject({ projectId: 10, from: "2026-09-01", to: "2026-09-30" });

    mocks.state.throwKind = "plain";
    const down = await projectReportsList(makeRequest("/api/project-reports"));
    expect(down.status).toBe(500);
    expect(await bodyOf(down)).toEqual({ error: "db down" });
  });

  it("POST multipart valido (sem arquivos) => 201 { projectReport, created: true }", async () => {
    const form = new FormData();
    form.set("projectId", "10");
    form.set("periodType", "monthly");
    form.set("content", "Conteúdo do relatório");
    const response = await projectReportsCreate(makeRequest("/api/project-reports", { method: "POST", formData: form }));
    expect(response.status).toBe(201);
    expect(await bodyOf(response)).toEqual({ projectReport: { id: 10, projectId: 10 }, created: true });
  });

  it("POST ValidationError => 400 tipado (mesmo status legado; corpo superset)", async () => {
    mocks.state.throwKind = "validation";
    const form = new FormData();
    form.set("projectId", "10");
    form.set("periodType", "weekly");
    form.set("content", "x");
    const response = await projectReportsCreate(makeRequest("/api/project-reports", { method: "POST", formData: form }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ error: "Dados inválidos: periodicidade inválida", code: "VALIDATION_ERROR" });
  });
});

describe("GET/PUT/DELETE /api/project-reports/[id]", () => {
  it("GET inexistente => 404 manual legado; 'Acesso negado' => 403 tipado; valido => 200 { projectReport }", async () => {
    const missing = await projectReportGet(makeRequest("/api/project-reports/999"), params({ id: "999" }));
    expect(missing.status).toBe(404);
    expect(await bodyOf(missing)).toEqual({ error: "Relatório não encontrado" });

    mocks.state.throwKind = "forbidden";
    const denied = await projectReportGet(makeRequest("/api/project-reports/10"), params({ id: "10" }));
    expect(denied.status).toBe(403);
    expect(await bodyOf(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });

    mocks.state.throwKind = null;
    const ok = await projectReportGet(makeRequest("/api/project-reports/10"), params({ id: "10" }));
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toEqual({ projectReport: { id: 10, projectName: "P" } });
  });

  it("PUT valido => 200 (title/content repassados); ValidationError => 400 tipado", async () => {
    const ok = await projectReportUpdate(
      makeRequest("/api/project-reports/10", { method: "PUT", body: { content: "novo" } }),
      params({ id: "10" }),
    );
    expect(ok.status).toBe(200);
    expect(mocks.state.calls.find((c) => c.method === "updateProjectReport")?.arg).toMatchObject({ reportId: 10, content: "novo" });

    mocks.state.throwKind = "validation";
    const bad = await projectReportUpdate(
      makeRequest("/api/project-reports/10", { method: "PUT", body: { content: "" } }),
      params({ id: "10" }),
    );
    expect(bad.status).toBe(400);
    expect(await bodyOf(bad)).toMatchObject({ error: "Dados inválidos: periodicidade inválida", code: "VALIDATION_ERROR" });
  });

  it("DELETE 'Relatório não encontrado' => 404 tipado; valido => { success: true }", async () => {
    mocks.state.throwKind = "notfound";
    const denied = await projectReportDelete(makeRequest("/api/project-reports/10", { method: "DELETE" }), params({ id: "10" }));
    expect(denied.status).toBe(404);
    expect(await bodyOf(denied)).toMatchObject({ error: "Relatório não encontrado", code: "NOT_FOUND" });

    mocks.state.throwKind = null;
    const ok = await projectReportDelete(makeRequest("/api/project-reports/10", { method: "DELETE" }), params({ id: "10" }));
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toEqual({ success: true });
  });
});

describe("GET /api/project-reports/[id]/aggregate e export.csv", () => {
  it("aggregate 'Acesso negado' => 403 tipado; valido => aggregate JSON cru", async () => {
    mocks.state.throwKind = "forbidden";
    const denied = await projectReportAggregate(makeRequest("/api/project-reports/10/aggregate"), params({ id: "10" }));
    expect(denied.status).toBe(403);
    expect(await bodyOf(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });

    mocks.state.throwKind = null;
    const ok = await projectReportAggregate(makeRequest("/api/project-reports/10/aggregate"), params({ id: "10" }));
    expect(ok.status).toBe(200);
    const body = await bodyOf(ok);
    expect(body).toMatchObject({ totals: { sessionCount: 1, totalHours: 2, logCount: 1 } });
  });

  it("export.csv => 200 text/csv com BOM e linhas; NotFoundError => 404 JSON tipado", async () => {
    const ok = await projectReportCsv(makeRequest("/api/project-reports/10/export.csv"), params({ id: "10" }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/csv");
    const raw = new Uint8Array(await ok.arrayBuffer());
    expect(raw[0]).toBe(0xef); // BOM UTF-8
    expect(raw[1]).toBe(0xbb);
    expect(raw[2]).toBe(0xbf);
    const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(raw);
    expect(csv).toContain('Relatório de projeto;"T"');
    expect(csv).toContain('"Conteúdo"');

    mocks.state.throwKind = "notfound";
    const missing = await projectReportCsv(makeRequest("/api/project-reports/999/export.csv"), params({ id: "999" }));
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).toContain("application/json");
    expect(await bodyOf(missing)).toMatchObject({ error: "Relatório não encontrado", code: "NOT_FOUND" });
  });
});

describe("POST /api/project-reports/[id]/attachments", () => {
  it("sem arquivos => 400 'Nenhum arquivo enviado' (congelado)", async () => {
    const form = new FormData();
    const response = await projectReportAttach(makeRequest("/api/project-reports/10/attachments", { method: "POST", formData: form }), params({ id: "10" }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "Nenhum arquivo enviado" });
  });

  it("valido => 201 { projectReport } (storedPath/metadata repassados); 'Acesso negado' => 403 tipado", async () => {
    const form = new FormData();
    form.set("files", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    const ok = await projectReportAttach(makeRequest("/api/project-reports/10/attachments", { method: "POST", formData: form }), params({ id: "10" }));
    expect(ok.status).toBe(201);
    expect(await bodyOf(ok)).toEqual({ projectReport: { id: 10, attachments: [{ id: 3 }] } });
    expect(mocks.state.calls.find((c) => c.method === "registerReportAttachment")?.arg).toMatchObject({
      reportId: 10,
      fileName: "a.png",
      storedPath: "uploads/reports/10/a.png",
      mimeType: "image/png",
      sizeBytes: 3,
    });

    mocks.state.throwKind = "forbidden";
    const denied = await projectReportAttach(makeRequest("/api/project-reports/10/attachments", { method: "POST", formData: form }), params({ id: "10" }));
    expect(denied.status).toBe(403);
    expect(await bodyOf(denied)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });
});

describe("GET /api/report-files/[...path]", () => {
  it("caminho fora do padrão uploads/reports/<id> => 404 'Arquivo não encontrado' (congelado)", async () => {
    const response = await reportFileGet(makeRequest("/api/report-files/other/x.png"), params({ path: ["other", "x.png"] }));
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toEqual({ error: "Arquivo não encontrado" });
  });

  it("acesso = getProjectReport: 'Acesso negado' => 403 tipado", async () => {
    mocks.state.throwKind = "forbidden";
    const response = await reportFileGet(makeRequest("/api/report-files/uploads/reports/10/x.png"), params({ path: ["uploads", "reports", "10", "x.png"] }));
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toMatchObject({ error: "Acesso negado", code: "FORBIDDEN" });
  });

  it("bytes ausentes => 404 legado; presentes => 200 com MIME + cache privado", async () => {
    mocks.state.fileBytes = null;
    const missing = await reportFileGet(makeRequest("/api/report-files/uploads/reports/10/x.png"), params({ path: ["uploads", "reports", "10", "x.png"] }));
    expect(missing.status).toBe(404);
    expect(await bodyOf(missing)).toEqual({ error: "Arquivo não encontrado" });

    mocks.state.fileBytes = new Uint8Array([137, 80, 78, 71]);
    const ok = await reportFileGet(makeRequest("/api/report-files/uploads/reports/10/x.png"), params({ path: ["uploads", "reports", "10", "x.png"] }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("cache-control")).toBe("private, max-age=3600");
  });
});

describe("rotas de leitura (hours/stats/history)", () => {
  it("GET /api/users/[id]/project-hours: id invalido => 400; valido => { hours }", async () => {
    const invalid = await userProjectHours(makeRequest("/api/users/abc/project-hours"), params({ id: "abc" }));
    expect(invalid.status).toBe(400);
    expect(await bodyOf(invalid)).toEqual({ error: "Usuário inválido" });

    const ok = await userProjectHours(makeRequest("/api/users/7/project-hours?weekStart=2026-09-14T03:00:00.000Z"), params({ id: "7" }));
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toEqual({ hours: [{ projectId: 10, hours: 5 }] });
  });

  it("GET /api/projects/stats => { stats } (shape congelado)", async () => {
    const response = await projectsStats();
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({ stats: { totalProjects: 3 } });
  });

  it("GET /api/projects/[id]/hours: acesso negado na rota => 403 'Acesso negado ao projeto' (congelado); valido => { hours }", async () => {
    mocks.state.projectAccess = false;
    const denied = await projectHours(makeRequest("/api/projects/10/hours"), params({ id: "10" }));
    expect(denied.status).toBe(403);
    expect(await bodyOf(denied)).toEqual({ error: "Acesso negado ao projeto" });

    mocks.state.projectAccess = true;
    const ok = await projectHours(makeRequest("/api/projects/10/hours"), params({ id: "10" }));
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toEqual({ hours: [{ userId: 1, hours: 2 }] });
  });

  it("GET /api/projects/[id]/weekly-hours: weekStart faltando => 400; valido => { hours }", async () => {
    const missing = await projectWeeklyHours(makeRequest("/api/projects/10/weekly-hours"), params({ id: "10" }));
    expect(missing.status).toBe(400);
    expect(await bodyOf(missing)).toEqual({ error: "weekStart é obrigatório" });

    const ok = await projectWeeklyHours(makeRequest("/api/projects/10/weekly-hours?weekStart=2026-09-14T03:00:00.000Z"), params({ id: "10" }));
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toEqual({ hours: { projectId: 10, weekStart: "2026-09-14T03:00:00.000Z", totalHours: 4 } });
  });

  it("GET /api/projects/[id]/hours-history => { history }; nao-DomainError => 500 com message legado", async () => {
    const ok = await projectHoursHistory(makeRequest("/api/projects/10/hours-history?months=6"), params({ id: "10" }));
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toEqual({ history: [{ month: "2026-09", totalHours: 9 }] });
    expect(mocks.state.calls.find((c) => c.method === "getProjectHoursHistory")?.arg).toMatchObject({ projectId: 10, months: 6 });

    mocks.state.throwKind = "plain";
    const down = await projectHoursHistory(makeRequest("/api/projects/10/hours-history"), params({ id: "10" }));
    expect(down.status).toBe(500);
    expect(await bodyOf(down)).toEqual({ error: "db down" });
  });
});
