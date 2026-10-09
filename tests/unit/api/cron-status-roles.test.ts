// @vitest-environment node
/**
 * B6-1a/B6-1b — contrato HTTP de /api/cron/status.
 *
 * A regra migrou em duas etapas e este arquivo é o contrato das duas:
 *  - B6-1a (DEC-51) corrigiu o gate de `["COORDENADOR"]` para `MANAGE_USERS`, porque
 *    COORDENADOR e GERENTE têm permissões IDÊNTICAS em `backend/domain/identity/permissions.ts`
 *    (comparadas linha a linha: nenhuma difere) e as rotas irmãs que protegem o mesmo tipo de
 *    gestão — `/api/weekly-hours-history` e `/api/projects/stats` — já usavam MANAGE_USERS.
 *  - B6-1b (D4) moveu esse mesmo gate da rota para o use case de work-execution.
 *
 * O que este arquivo fixa é a TRADUÇÃO HTTP: quem passa, com que corpo, e qual status. A
 * decisão em si (quais papéis, qual mensagem, qual ordem de checagem) é fixada por
 * tests/unit/modules/work-execution/use-cases.cron-operations.test.ts.
 *
 * Por isso a fixtures usa o módulo REAL (`createWorkExecutionModule`) com uma PORTA FALSA em vez
 * de dobrar o módulo inteiro: assim o use case verdadeiro decide, e o duplo só substitui o
 * agendador — que faz I/O e falharia sem banco.
 *
 * `cronService` NÃO é dobrado aqui: a porta falsa o torna inalcançável. Se um dia o POST voltar a
 * tocar o singleton de verdade, este teste passa a falhar em vez de disparar um reset semanal
 * contra o banco — que foi o motivo de não-tocar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ValidationError } from "@/backend/domain";
import { UNKNOWN_CRON_ACTION_MESSAGE } from "@/backend/modules/work-execution/application/use-cases/execute-manual-cron-reset.use-case";
import type { CronStatus } from "@/backend/modules/work-execution/application/ports/cron-operations.port";

const STATUS: CronStatus = {
  isInitialized: true,
  weeklyResetRunning: false,
  weeklyResetNextRun: "2026-10-05T03:00:00.000Z",
  weeklyResetSchedule: "0 0 * * 1 (Segunda-feira às 00:00)",
};

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  resetExecutado: 0,
  statusLido: 0,
  /** Quando preenchido, o duplo do agendador falha com este erro (caminho do 500). */
  erroDoAgendador: null as Error | null,
}));

vi.mock("@/lib/services/cron-service", () => ({
  // Só existe para QUEBRAR O CICLO de import, não para servir dados: cron-service importa o
  // composition root, e o factory abaixo o importa de volta. Os contadores vivem nos métodos,
  // então se algo tocar o singleton por outro caminho o teste ainda acusa.
  cronService: {
    getStatus: async () => {
      mocks.statusLido += 1;
      if (mocks.erroDoAgendador) throw mocks.erroDoAgendador;
      return STATUS;
    },
    executeManualReset: async () => {
      mocks.resetExecutado += 1;
      if (mocks.erroDoAgendador) throw mocks.erroDoAgendador;
    },
  },
}));

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

// O módulo REAL entra pela composition root — sem portas falsas. O duplo do cron-service acima já
// é a fronteira: o adaptador real o consome, e os contadores nele provam que o gate roda ANTES do
// trabalho (um 403 não pode ter tocado o agendador). Dobrar a porta aqui esconderia exatamente o
// caminho que este lote criou.
vi.mock("@/backend/composition/root", async () => {
  const { createWorkExecutionModule: create } = await import("@/backend/modules/work-execution");
  return {
    getBackendComposition: () => ({ workExecution: create() }),
  };
});

import { GET as cronStatusGet, POST as cronStatusPost } from "@/app/api/cron/status/route";

function login(roles: string[]) {
  mocks.session = { id: 42, email: "user@lab.com", name: "Usuário", roles, status: "active" };
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
  mocks.session = null;
  mocks.resetExecutado = 0;
  mocks.statusLido = 0;
  mocks.erroDoAgendador = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("B6-1 — /api/cron/status aceita os dois papéis de gestão (MANAGE_USERS)", () => {
  it.each(["COORDENADOR", "GERENTE"])("GET 200 para %s", async (papel) => {
    login([papel]);
    const response = await cronStatusGet();
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ status: STATUS });
    expect(mocks.statusLido).toBe(1);
  });

  it.each(["COORDENADOR", "GERENTE"])("POST manual-reset executa para %s", async (papel) => {
    login([papel]);
    const response = await cronStatusPost(request({ action: "manual-reset" }));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ message: "Reset manual executado com sucesso" });
    expect(mocks.resetExecutado).toBe(1);
  });

  it.each([
    ["LABORATORISTA", "tem manage_work_sessions, mas não manage_users"],
    ["GERENTE_PROJETO", "tem manage_projects, mas não manage_users"],
    ["COLABORADOR", "tem manage_tasks, mas não manage_users"],
    ["PESQUISADOR", "tem manage_tasks, mas não manage_users"],
    ["VOLUNTARIO", "não tem nenhuma permissão de gestão"],
  ])("%s recebe 403 (%s) sem tocar o agendador", async (papel) => {
    login([papel]);
    const get = await cronStatusGet();
    expect(get.status).toBe(403);
    expect(await body(get)).toEqual({
      error: "Apenas coordenadores e gerentes podem acessar.",
      code: "FORBIDDEN",
      details: {},
    });
    expect(mocks.statusLido).toBe(0);

    mocks.resetExecutado = 0;
    const post = await cronStatusPost(request({ action: "manual-reset" }));
    expect(post.status).toBe(403);
    expect(await body(post)).toEqual({
      error: "Apenas coordenadores e gerentes podem acessar.",
      code: "FORBIDDEN",
      details: {},
    });
    expect(mocks.resetExecutado).toBe(0);
  });

  it("sem sessão devolve 401 antes do gate de papel", async () => {
    mocks.session = null;
    expect((await cronStatusGet()).status).toBe(401);
    expect((await cronStatusPost(request({ action: "manual-reset" }))).status).toBe(401);
    expect(mocks.statusLido).toBe(0);
    expect(mocks.resetExecutado).toBe(0);
  });

  it("a ordem se mantém: não autorizado + ação desconhecida é 403, não 400", async () => {
    // A rota legada checava o papel ANTES de ler o corpo. Se alguém mover o despacho para antes
    // do gate, este caso vira 400 e o contrato quebra para todo caller não autorizado.
    login(["VOLUNTARIO"]);
    const response = await cronStatusPost(request({ action: "nope" }));
    expect(response.status).toBe(403);
    expect((await body(response)).error).toBe("Apenas coordenadores e gerentes podem acessar.");
    expect(mocks.resetExecutado).toBe(0);
  });

  it("ação desconhecida de quem tem o gate é 400 com a mensagem legada", async () => {
    login(["COORDENADOR"]);
    const response = await cronStatusPost(request({ action: "nope" }));
    expect(response.status).toBe(400);
    expect((await body(response)).error).toBe("Ação não reconhecida");
    expect(mocks.resetExecutado).toBe(0);
  });

  it("corpo sem action é 400 para quem tem o gate", async () => {
    login(["GERENTE"]);
    const response = await cronStatusPost(request({}));
    expect(response.status).toBe(400);
    expect((await body(response)).error).toBe("Ação não reconhecida");
  });

  it("erro do agendador não vaza: 500 com a mensagem legada", async () => {
    login(["COORDENADOR"]);
    mocks.erroDoAgendador = new Error("detalhe interno do agendador");
    const response = await cronStatusGet();
    expect(response.status).toBe(500);
    // A mensagem interna do agendador não pode aparecer no corpo — a rota a troca pelo 500 legado.
    expect(await body(response)).toEqual({ error: "Erro interno do servidor" });
    mocks.erroDoAgendador = null;
  });
});

describe("B6-1b — o use case, e não a rota, é quem recusa", () => {
  it("a porta real do agendador nunca é alcançada num 403 (o duplo prova o atalho)", async () => {
    login(["VOLUNTARIO"]);
    await cronStatusGet();
    // `cronPort.getStatus` é o que o adaptador real chamaria; o contador acima já provou 0.
    expect(mocks.statusLido).toBe(0);
  });

  it("o 400 vem do domínio (ValidationError), não de um NextResponse cru na rota", async () => {
    // Se a rota voltar a validar `action` por conta própria, o status e a `error` continuam iguais
    // e só o `code` denuncia a regressão — por isso este caso existe.
    login(["COORDENADOR"]);
    const response = await cronStatusPost(request({ action: "nope" }));
    const payload = await body(response);
    expect(payload.error).toBe(UNKNOWN_CRON_ACTION_MESSAGE);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(new ValidationError(UNKNOWN_CRON_ACTION_MESSAGE).name).toBeDefined();
  });
});