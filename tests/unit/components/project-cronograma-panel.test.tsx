/**
 * V5-5b — testes de UI do painel de cronograma no diálogo de detalhe do projeto.
 *
 * Por que existe: o painel é a parte do batch que o `tsc` não cobre. A rede é um `fetch`
 * gravador (mesma razão medida no V5-2c: o `fetch` do undici que o Vitest injeta no jsdom não
 * serializa `File` em `FormData`; aqui não há upload, e o corpo gravado prova exatamente o que
 * sai para a rota).
 *
 * O substituto CONSUME as funções do domínio (`toggleActivityMonthRange`,
 * `cronogramaMonthColumns`, `activityPeriod`, `activityReward`, `normalizeGoalTarget`,
 * `normalizeActivityDescription`), em vez de reimplementar a regra (DEC-90). Assim o teste prova
 * que a tela chama a mesma função que a rota chama, e não uma cópia que concorda por acaso.
 *
 * Costura medida (mesma do arquivo de painéis de arquivo):
 *   - `useToast` só chega ao DOM com `<Toaster/>` montado, e montar o Toaster exige
 *     `matchMedia`, que o jsdom desta base não tem. O stub é LOCAL a este arquivo.
 *   - `confirm` não existe no jsdom; o painel confirma antes de apagar.
 *   - `userEvent` cru é lento sob carga paralela: `setup({ delay: null })`.
 *
 * V5-7a (DEC-76/162): o painel passou a ler `useAuth` (o gate de pedir é calculado pela mesma
 * função do domínio que o servidor executa, DEC-92), então o contexto é dobrado aqui. O
 * substituto do fluxo de conclusão aplica as recusas com as FUNÇÕES do domínio (DEC-90): a tela
 * mostra a frase que o servidor mostraria, não uma cópia que concorda por acaso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";

import { ProjectCronogramaPanel } from "@/components/features/project-cronograma-panel";
import {
  ACTIVITY_MIN_MONTH_MESSAGE,
  ACTIVITY_NO_PROOF_MESSAGE,
  activityApproveConflictMessage,
  activityCompletionAward,
  activityOpenTasksMessage,
  activityPeriod,
  activityRequestConflictMessage,
  activityReward,
  canActorApproveActivityCompletionDecision,
  cronogramaMonthColumns,
  distributeActivityAward,
  isActivityCurrent,
  memberTaskCredits,
  monthKeysBetween,
  normalizeActivityDescription,
  normalizeGoalDescription,
  normalizeGoalTarget,
  toggleActivityMonthRange,
  type Role,
} from "@/backend/domain";

const PROJECT = 7;
const TODAY = "2026-10-15";
const START_DATE = "2026-03-01";
const END_DATE = "2026-08-31";

/** `useAuth` dobrado: o painel decide o botão do fluxo com a sessão (DEC-92). */
const authMocks = vi.hoisted(() => ({
  user: null as null | { id: number; name: string; email: string; roles: Role[] },
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: authMocks.user }),
}));

interface GoalRow {
  id: number;
  projectId: number;
  order: number;
  target: number | null;
  description: string;
  createdAt: string;
}

interface ActivityRow {
  id: number;
  projectId: number;
  order: number;
  description: string;
  responsibleId: number | null;
  firstMonth: string;
  lastMonth: string;
  status: string;
  requestedBy: number | null;
  requestedAt: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
}

interface ProofRow {
  id: number;
  activityId: number;
  name: string;
  contentType: string;
  size: number;
  uploadedBy: number;
  uploadedAt: string;
}

interface RecordedRequest {
  method: string;
  path: string;
  json?: Record<string, unknown>;
}

  const mocks = {
    goals: [] as GoalRow[],
    activities: [] as ActivityRow[],
    memberIds: [] as number[],
    memberRoles: {} as Record<number, string[]>,
    proofs: [] as ProofRow[],
    /** Tarefas ABERTAS por atividade — a conta da trava DEC-99 no substituto. */
    openTasks: {} as Record<number, number>,
    /** Matéria-prima da atribuição (DEC-163) — a conta da aprovação no substituto. */
    completedTasks: [] as Array<{ taskId: number; assigneeIds: number[]; completerIds: number[] }>,
    requests: [] as RecordedRequest[],
    refuseWrite: false,
    nextId: 700,
  };

function resetStore() {
  mocks.goals = [
    {
      id: 301,
      projectId: PROJECT,
      order: 1,
      target: 2,
      description: "Publicar artigo",
      createdAt: "2026-10-01T12:00:00.000Z",
    },
  ];
  mocks.activities = [
    {
      id: 401,
      projectId: PROJECT,
      order: 1,
      description: "Revisão da literatura",
      responsibleId: 4,
      firstMonth: "2026-03",
      lastMonth: "2026-05",
      status: "OPEN",
      requestedBy: null,
      requestedAt: null,
      approvedBy: null,
      approvedAt: null,
    },
    {
      id: 402,
      projectId: PROJECT,
      order: 2,
      description: "Coleta de dados",
      responsibleId: null,
      firstMonth: "2026-07",
      lastMonth: "2026-07",
      status: "OPEN",
      requestedBy: null,
      requestedAt: null,
      approvedBy: null,
      approvedAt: null,
    },
    // V5-7b: prazo em dez/2026 — "hoje" (15/10) está antecipado → ×1,5 determinístico.
    {
      id: 403,
      projectId: PROJECT,
      order: 3,
      description: "Redação final",
      responsibleId: 4,
      firstMonth: "2026-11",
      lastMonth: "2026-12",
      status: "OPEN",
      requestedBy: null,
      requestedAt: null,
      approvedBy: null,
      approvedAt: null,
    },
  ];
  mocks.memberIds = [4];
  mocks.memberRoles = { 4: ["VOLUNTARIO"] };
  mocks.proofs = [
    {
      id: 501,
      activityId: 401,
      name: "parcial.pdf",
      contentType: "application/pdf",
      size: 2048,
      uploadedBy: 4,
      uploadedAt: "2026-10-01T12:00:00.000Z",
    },
  ];
  mocks.openTasks = {};
  mocks.completedTasks = [{ taskId: 601, assigneeIds: [4], completerIds: [] }];
  mocks.requests = [];
  mocks.refuseWrite = false;
  mocks.nextId = 700;
  authMocks.user = { id: 4, name: "Ana Bolsista", email: "ana@lab.com", roles: ["VOLUNTARIO"] };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function monthColumns() {
  return cronogramaMonthColumns({
    startDate: START_DATE,
    endDate: END_DATE,
    today: TODAY,
    markedRanges: mocks.activities.map((activity) => ({
      firstMonth: activity.firstMonth,
      lastMonth: activity.lastMonth,
    })),
  });
}

/** Atividade na forma da rota: colunas do banco + o que o domínio deriva na leitura. */
function activityPayload(activity: ActivityRow) {
  return {
    ...activity,
    months: monthKeysBetween(activity.firstMonth, activity.lastMonth),
    ...activityPeriod(activity.firstMonth, activity.lastMonth),
    reward: activityReward(activity.firstMonth, activity.lastMonth),
    current: isActivityCurrent(
      { firstMonth: activity.firstMonth, lastMonth: activity.lastMonth },
      TODAY,
    ),
  };
}

function cronogramaPayload() {
  return {
    cronograma: {
      projectId: PROJECT,
      today: TODAY,
      months: monthColumns(),
      goals: mocks.goals.map((goal) => ({ ...goal })),
      activities: mocks.activities.map(activityPayload),
    },
  };
}

function writeRefused() {
  return jsonResponse({ error: "Não autorizado" }, 403);
}

async function recordingFetch(input: unknown, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const path = new URL(String(input), "http://localhost:3000").pathname;
  const segments = path.split("/"); // ["", "api", "projects", "7", "activities", "401"]
  const resource = segments[4];
  const resourceId = Number(segments[5]);
  const body =
    typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
  mocks.requests.push({ method, path, json: body });

  if (resource === "cronograma" && method === "GET") {
    return jsonResponse(cronogramaPayload());
  }

  if (resource === "members" && method === "GET") {
    return jsonResponse({
      members: mocks.memberIds.map((userId) => ({
        id: userId * 10,
        userId,
        userName: userId === 4 ? "Ana Bolsista" : `#${userId}`,
        userEmail: null,
        roles: mocks.memberRoles[userId] ?? ["VOLUNTARIO"],
        joinedAt: "2026-03-01T00:00:00.000Z",
      })),
    });
  }

  if (resource === "goals") {
    if (method === "POST") {
      if (mocks.refuseWrite) return writeRefused();
      const description = normalizeGoalDescription(body?.description);
      const id = mocks.nextId++;
      const goal: GoalRow = {
        id,
        projectId: PROJECT,
        // A ordem é do servidor (DEC-156d): max + 1, e o corpo da tela não traz `order`.
        order: mocks.goals.reduce((max, goal) => Math.max(max, goal.order), 0) + 1,
        target: normalizeGoalTarget(body?.target),
        description,
        createdAt: "2026-10-15T12:00:00.000Z",
      };
      mocks.goals.push(goal);
      return jsonResponse({ goal }, 201);
    }
    if (method === "PATCH") {
      if (mocks.refuseWrite) return writeRefused();
      const goal = mocks.goals.find((row) => row.id === resourceId);
      if (!goal) return jsonResponse({ error: "Meta não encontrada" }, 404);
      if (body?.description !== undefined) goal.description = normalizeGoalDescription(body.description);
      if (body?.target !== undefined) goal.target = normalizeGoalTarget(body.target);
      return jsonResponse({ goal });
    }
    if (method === "DELETE") {
      if (mocks.refuseWrite) return writeRefused();
      mocks.goals = mocks.goals.filter((row) => row.id !== resourceId);
      return jsonResponse({ ok: true });
    }
  }

  // V5-7a: as sub-rotas da linha do cronograma vêm ANTES do ramo genérico de atividades.
  const sub = segments[6];

  if (resource === "activities" && sub === "files" && method === "GET") {
    return jsonResponse({
      files: mocks.proofs.filter((proof) => proof.activityId === resourceId),
    });
  }

  if (resource === "activities" && sub === "request-completion" && method === "POST") {
    const activity = mocks.activities.find((row) => row.id === resourceId);
    if (!activity) return jsonResponse({ error: "Atividade não encontrada" }, 404);
    // O substituto aplica as recusas com as FUNÇÕES do domínio (DEC-90), na MESMA ordem da
    // produção: status (409), trava DEC-99 (400), prova ausente DEC-162 (400).
    if (activity.status !== "OPEN") {
      return jsonResponse({ error: activityRequestConflictMessage(activity.status as never) }, 409);
    }
    const openTasks = mocks.openTasks[resourceId] ?? 0;
    if (openTasks > 0) {
      return jsonResponse({ error: activityOpenTasksMessage(openTasks) }, 400);
    }
    if (mocks.proofs.filter((proof) => proof.activityId === resourceId).length === 0) {
      return jsonResponse({ error: ACTIVITY_NO_PROOF_MESSAGE }, 400);
    }
    activity.status = "COMPLETION_REQUESTED";
    activity.requestedBy = authMocks.user?.id ?? null;
    activity.requestedAt = "2026-10-15T12:00:00.000Z";
    return jsonResponse({ activity: activityPayload(activity) });
  }

  if (resource === "activities" && sub === "approve-completion" && method === "POST") {
    const activity = mocks.activities.find((row) => row.id === resourceId);
    if (!activity) return jsonResponse({ error: "Atividade não encontrada" }, 404);
    // Gate e recusa de status com as FUNÇÕES do domínio (DEC-90): global manager, GERENTE não
    // aprova o que pediu (DEC-77), e o 409 tem a frase do status (DEC-162).
    if (!canActorApproveActivityCompletionDecision(authMocks.user?.id ?? -1, authMocks.user?.roles ?? [], activity.requestedBy)) {
      return jsonResponse(
        { error: "Usuário não tem permissão para aprovar a conclusão desta atividade" },
        403,
      );
    }
    if (activity.status !== "COMPLETION_REQUESTED") {
      return jsonResponse({ error: activityApproveConflictMessage(activity.status as never) }, 409);
    }
    // A economia do substituto é a do domínio (DEC-90): prêmio com o dia de hoje, atribuição e
    // Hamilton sobre os membros ativos.
    const award = activityCompletionAward({
      firstMonth: activity.firstMonth,
      lastMonth: activity.lastMonth,
      approvedDay: TODAY,
    });
    const credits = memberTaskCredits(mocks.completedTasks);
    const shares = distributeActivityAward(
      award,
      mocks.memberIds.map((userId) => ({ userId, completedTasks: credits.get(userId) ?? 0 })),
    );
    activity.status = "DONE";
    activity.approvedBy = authMocks.user?.id ?? null;
    activity.approvedAt = "2026-10-15T12:00:00.000Z";
    return jsonResponse({
      activity: activityPayload(activity),
      award,
      shares: [...shares.entries()]
        .filter(([, points]) => points > 0)
        .map(([userId, points]) => ({ userId, points })),
    });
  }

  if (resource === "activities") {
    if (method === "POST") {
      if (mocks.refuseWrite) return writeRefused();
      const firstMonth = String(body?.firstMonth ?? "");
      const lastMonth = String(body?.lastMonth ?? "");
      const id = mocks.nextId++;
      const activity: ActivityRow = {
        id,
        projectId: PROJECT,
        order: mocks.activities.reduce((max, activity) => Math.max(max, activity.order), 0) + 1,
        description: normalizeActivityDescription(body?.description),
        responsibleId: body?.responsibleId === undefined ? null : Number(body.responsibleId),
        firstMonth,
        lastMonth,
        status: "OPEN",
        requestedBy: null,
        requestedAt: null,
        approvedBy: null,
        approvedAt: null,
      };
      mocks.activities.push(activity);
      return jsonResponse({ activity: activityPayload(activity) }, 201);
    }
    if (method === "PATCH") {
      if (mocks.refuseWrite) return writeRefused();
      const activity = mocks.activities.find((row) => row.id === resourceId);
      if (!activity) return jsonResponse({ error: "Atividade não encontrada" }, 404);
      if (body?.description !== undefined) {
        activity.description = normalizeActivityDescription(body.description);
      }
      if (body?.firstMonth !== undefined) activity.firstMonth = String(body.firstMonth);
      if (body?.lastMonth !== undefined) activity.lastMonth = String(body.lastMonth);
      if (body?.responsibleId !== undefined) {
        activity.responsibleId = body.responsibleId === null ? null : Number(body.responsibleId);
      }
      return jsonResponse({ activity: activityPayload(activity) });
    }
    if (method === "DELETE") {
      if (mocks.refuseWrite) return writeRefused();
      mocks.activities = mocks.activities.filter((row) => row.id !== resourceId);
      return jsonResponse({ ok: true });
    }
  }

  throw new Error(`rota não prevista pelo gravador: ${method} ${path}`);
}

function renderPanel(canManage = true, leaderId: number | null = null) {
  return render(
    <>
      <ProjectCronogramaPanel projectId={PROJECT} canManage={canManage} leaderId={leaderId} />
      {/* Sem isto nenhum toast chega ao DOM (medido no V4-5a). */}
      <Toaster />
    </>,
  );
}

function requestsFor(method: string, suffix: string) {
  return mocks.requests.filter(
    (request) => request.method === method && request.path.endsWith(suffix),
  );
}

beforeEach(() => {
  resetStore();
  vi.stubGlobal("fetch", vi.fn(recordingFetch));
  // Stub LOCAL: um shim global em tests/setup.ts mudaria o caminho "mobile" dos testes do quadro.
  vi.stubGlobal(
    "matchMedia",
    vi.fn<(query: string) => MediaQueryList>((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal("confirm", vi.fn<(message?: string) => boolean>(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("painel de cronograma", () => {
  it("lista metas, atividades e as colunas do período do projeto", async () => {
    renderPanel();

    expect(await screen.findByDisplayValue("Publicar artigo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Revisão da literatura")).toBeInTheDocument();
    // DEC-151: as colunas são o período do projeto (mar/2026 a ago/2026), não 12 meses fixos.
    expect(screen.getByText("mar/2026")).toBeInTheDocument();
    expect(screen.getByText("ago/2026")).toBeInTheDocument();
    // DEC-126a: a recompensa é 100 × meses marcados (mar, abr, mai = 300).
    expect(screen.getByText("300 pts")).toBeInTheDocument();
    expect(screen.getByText("100 pts")).toBeInTheDocument();
  });

  it("lista vazia diz isso em palavras", async () => {
    mocks.goals = [];
    mocks.activities = [];
    renderPanel();

    expect(await screen.findByText(/Nenhuma meta ainda/)).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma atividade/)).toBeInTheDocument();
  });

  it("quem não gerencia vê a grade sem nenhum controle de escrita", async () => {
    renderPanel(false);

    expect(await screen.findByDisplayValue("Revisão da literatura")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar atividade" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar meta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "mar/2026 — atividade 1" })).toBeDisabled();
    expect(screen.getByLabelText("Descrição da atividade 1")).toBeDisabled();
  });

  it("clicar depois do último mês estende a linha, com o intervalo da regra do domínio", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await screen.findByDisplayValue("Revisão da literatura");

    // mar..mai + clicar jun → mar..jun (DEC-126d). O intervalo asserted é o que
    // `toggleActivityMonthRange` devolve, não um valor escrito à mão.
    const expected = toggleActivityMonthRange({ firstMonth: "2026-03", lastMonth: "2026-05" }, "2026-06");
    await user.click(screen.getByRole("button", { name: "jun/2026 — atividade 1" }));

    await waitFor(() => expect(requestsFor("PATCH", "/activities/401")).toHaveLength(1));
    expect(requestsFor("PATCH", "/activities/401")[0].json).toEqual(expected);
    expect(screen.getByRole("button", { name: "jun/2026 — atividade 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("400 pts")).toBeInTheDocument();
  });

  it("clicar no último mês desmarca e a linha encolhe", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await screen.findByDisplayValue("Revisão da literatura");

    await user.click(screen.getByRole("button", { name: "mai/2026 — atividade 1" }));

    await waitFor(() => expect(requestsFor("PATCH", "/activities/401")).toHaveLength(1));
    expect(requestsFor("PATCH", "/activities/401")[0].json).toEqual({
      firstMonth: "2026-03",
      lastMonth: "2026-04",
    });
  });

  it("desmarcar a única marca é recusado com a frase do domínio, e nada é escrito", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await screen.findByDisplayValue("Coleta de dados");

    await user.click(screen.getByRole("button", { name: "jul/2026 — atividade 2" }));

    expect(await screen.findByText(ACTIVITY_MIN_MONTH_MESSAGE)).toBeInTheDocument();
    expect(requestsFor("PATCH", "/activities/402")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "jul/2026 — atividade 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("linha nova nasce SEM marca e só é escrita quando descrição e mês existem (DEC-172)", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await screen.findByDisplayValue("Revisão da literatura");

    await user.click(screen.getByRole("button", { name: "Adicionar atividade" }));
    // Sem descrição e sem mês não há POST: linha vazia poluiria o cronograma e o domínio recusa.
    expect(requestsFor("POST", "/activities")).toHaveLength(0);

    // A semente tem 3 linhas (401/402/403) — a linha nova nasce na ordem 4, sem marca.
    const input = screen.getByLabelText("Descrição da atividade 4");
    await user.type(input, "Análise dos resultados");
    await user.tab();
    // Descrição sozinha ainda não salva: a linha-rascunho espera o mês (DEC-172).
    expect(requestsFor("POST", "/activities")).toHaveLength(0);
    expect(screen.getByText("Sem mês marcado — clique num mês para começar")).toBeInTheDocument();

    // Marcar é o que completa a linha: o POST sai com o mês clicado.
    await user.click(screen.getByRole("button", { name: "set/2026 — atividade 4" }));

    await waitFor(() => expect(requestsFor("POST", "/activities")).toHaveLength(1));
    const body = requestsFor("POST", "/activities")[0].json!;
    expect(body).toMatchObject({
      description: "Análise dos resultados",
      firstMonth: "2026-09",
      lastMonth: "2026-09",
      responsibleId: null,
    });
    // DEC-156d: a ordem é atribuída pelo servidor; a tela não manda número de linha.
    expect(body.order).toBeUndefined();
  });

  it("a atividade começa no mês clicado — clicar set/2026 marca SÓ setembro (DEC-172)", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await screen.findByDisplayValue("Revisão da literatura");

    await user.click(screen.getByRole("button", { name: "Adicionar atividade" }));
    await user.click(screen.getByRole("button", { name: "set/2026 — atividade 4" }));

    // Nada de "do primeiro mês até setembro": só a coluna clicada fica marcada.
    expect(screen.getByRole("button", { name: "mar/2026 — atividade 4" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "set/2026 — atividade 4" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("set/2026 → set/2026 · 1 mês")).toBeInTheDocument();
  });

  it("rascunho pode trocar o mês de início: desmarcar a única marca devolve a linha a sem-mês", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await screen.findByDisplayValue("Revisão da literatura");

    await user.click(screen.getByRole("button", { name: "Adicionar atividade" }));
    await user.click(screen.getByRole("button", { name: "mar/2026 — atividade 4" }));
    expect(screen.getByRole("button", { name: "mar/2026 — atividade 4" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Clicar no único mês marcado desmarca — e o POST ainda não saiu (descrição vazia).
    await user.click(screen.getByRole("button", { name: "mar/2026 — atividade 4" }));
    expect(screen.getByRole("button", { name: "mar/2026 — atividade 4" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(requestsFor("POST", "/activities")).toHaveLength(0);
    expect(screen.getByText("Sem mês marcado — clique num mês para começar")).toBeInTheDocument();
  });

  it("escolher o responsável escreve só o campo que mudou", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await screen.findByDisplayValue("Coleta de dados");

    await user.click(screen.getByRole("combobox", { name: "Responsável da atividade 2" }));
    await user.click(await screen.findByRole("option", { name: "Ana Bolsista" }));

    await waitFor(() => expect(requestsFor("PATCH", "/activities/402")).toHaveLength(1));
    expect(requestsFor("PATCH", "/activities/402")[0].json).toEqual({ responsibleId: 4 });
  });

  it("meta nova entra no blur da descrição, e o número é opcional", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await screen.findByDisplayValue("Publicar artigo");

    await user.click(screen.getByRole("button", { name: "Adicionar meta" }));
    await user.type(screen.getByLabelText("Descrição da meta 2"), "Depositar o dataset");
    await user.tab();

    await waitFor(() => expect(requestsFor("POST", "/goals")).toHaveLength(1));
    expect(requestsFor("POST", "/goals")[0].json).toEqual({ description: "Depositar o dataset" });

    // O número existe porque a brochura tem entregáveis quantitativos, mas não é obrigatório
    // (DEC-156e): escrever no campo de número é o que manda `target`.
    await user.type(screen.getByLabelText("Meta numérica da meta 2"), "5");
    await user.tab();

    const created = mocks.goals.find((goal) => goal.description === "Depositar o dataset")!;
    await waitFor(() => expect(requestsFor("PATCH", `/goals/${created.id}`)).toHaveLength(1));
    expect(requestsFor("PATCH", `/goals/${created.id}`)[0].json).toEqual({ target: 5 });
  });

  it("apagar atividade pede confirmação e apaga só aquela linha", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await screen.findByDisplayValue("Revisão da literatura");

    await user.click(screen.getByRole("button", { name: "Apagar atividade 1" }));

    await waitFor(() => expect(screen.queryByDisplayValue("Revisão da literatura")).not.toBeInTheDocument());
    expect(requestsFor("DELETE", "/activities/401")).toHaveLength(1);
    expect(requestsFor("DELETE", "/activities/402")).toHaveLength(0);
    expect(screen.getByDisplayValue("Coleta de dados")).toBeInTheDocument();
  });

  it("403 do servidor chega como erro na tela, não como botão desabilitado", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.refuseWrite = true;
    renderPanel();
    await screen.findByDisplayValue("Revisão da literatura");

    await user.click(screen.getByRole("button", { name: "jun/2026 — atividade 1" }));

    expect(await screen.findByText("Não autorizado")).toBeInTheDocument();
    // A linha na tela não mudou: o estado local só é escrito pela resposta do servidor.
    expect(screen.getByRole("button", { name: "jun/2026 — atividade 1" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  describe("fluxo de conclusão da linha (V5-7a, DEC-76/162)", () => {
    it("o líder vê o botão Conclusão; quem não é líder nem gestor de membership não vê", async () => {
      const asLeader = renderPanel(true, 4);
      await screen.findByDisplayValue("Revisão da literatura");

      expect(screen.getByRole("button", { name: "Conclusão da atividade 1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Conclusão da atividade 2" })).toBeInTheDocument();

      // Mesmo canManage, gate diferente: o par da DEC-76 (líder OU membership de gestor).
      asLeader.unmount();
      renderPanel(true, 99);
      await screen.findByDisplayValue("Revisão da literatura");
      expect(
        screen.queryByRole("button", { name: "Conclusão da atividade 1" }),
      ).not.toBeInTheDocument();
    });

    it("membership de gestor vê o botão, mesmo sem ser o líder", async () => {
      mocks.memberRoles = { 4: ["GERENTE_PROJETO"] };
      renderPanel(true, 99);
      await screen.findByDisplayValue("Revisão da literatura");

      expect(screen.getByRole("button", { name: "Conclusão da atividade 1" })).toBeInTheDocument();
    });

    it("o botão abre o diálogo com as provas da linha e o campo de anexar", async () => {
      const user = userEvent.setup({ delay: null });
      renderPanel(true, 4);
      await screen.findByDisplayValue("Revisão da literatura");

      await user.click(screen.getByRole("button", { name: "Conclusão da atividade 1" }));

      expect(await screen.findByText("parcial.pdf")).toBeInTheDocument();
      // A aceitação do campo é a allowlist do seam traduzida (medido no V5-2d: o `accept`
      // descarta em silêncio; a recusa do mime pelo servidor é provada no teste de rota).
      expect(screen.getByLabelText("Arquivo de prova")).toHaveAttribute(
        "accept",
        expect.stringContaining("application/pdf"),
      );
      expect(requestsFor("GET", "/activities/401/files")).toHaveLength(1);
    });

    it("solicitar conclusão escreve POST, fecha o diálogo e a linha vira 'Conclusão solicitada'", async () => {
      const user = userEvent.setup({ delay: null });
      renderPanel(true, 4);
      await screen.findByDisplayValue("Revisão da literatura");

      await user.click(screen.getByRole("button", { name: "Conclusão da atividade 1" }));
      await screen.findByText("parcial.pdf");
      await user.click(screen.getByRole("button", { name: "Solicitar conclusão" }));

      await waitFor(() =>
        expect(requestsFor("POST", "/activities/401/request-completion")).toHaveLength(1),
      );
      expect(await screen.findByText("A aprovação é do coordenador ou gerente do sistema.")).toBeInTheDocument();
      // O diálogo fechou; a grade é o lugar do estado novo.
      expect(screen.queryByRole("button", { name: "Solicitar conclusão" })).not.toBeInTheDocument();
      expect(screen.getByText("Conclusão solicitada")).toBeInTheDocument();
    });

    it("prova ausente: o 400 do servidor chega com a frase do domínio (DEC-162)", async () => {
      const user = userEvent.setup({ delay: null });
      mocks.proofs = [];
      renderPanel(true, 4);
      await screen.findByDisplayValue("Revisão da literatura");

      await user.click(screen.getByRole("button", { name: "Conclusão da atividade 2" }));
      await screen.findByText("Nenhuma prova anexada.");
      await user.click(screen.getByRole("button", { name: "Solicitar conclusão" }));

      // A frase exata do domínio, sem o ponto da dica fixa — a tela repete o servidor (DEC-90).
      expect(await screen.findByText(ACTIVITY_NO_PROOF_MESSAGE)).toBeInTheDocument();
    });

    it("trava DEC-99: o 400 dizendo quantas tarefas faltam chega na tela", async () => {
      const user = userEvent.setup({ delay: null });
      mocks.openTasks = { 401: 2 };
      renderPanel(true, 4);
      await screen.findByDisplayValue("Revisão da literatura");

      await user.click(screen.getByRole("button", { name: "Conclusão da atividade 1" }));
      await screen.findByText("parcial.pdf");
      await user.click(screen.getByRole("button", { name: "Solicitar conclusão" }));

      expect(await screen.findByText(activityOpenTasksMessage(2))).toBeInTheDocument();
      // A linha não mudou: a recusa não grava nada.
      expect(screen.queryByText("Conclusão solicitada")).not.toBeInTheDocument();
    });
  });

  describe("aprovação da linha (V5-7b, DEC-76/77/103/104)", () => {
    // Atividade 403 (nov–dez/2026): prazo 31/12/2026 — "hoje" (15/10) está antecipado ≥2 dias,
    // então o prêmio do substituto é base 200 × 1,5 = 300, determinístico (DEC-103).
    function seedProofFor403() {
      mocks.proofs.push({
        id: 502,
        activityId: 403,
        name: "rascunho.pdf",
        contentType: "application/pdf",
        size: 1024,
        uploadedBy: 4,
        uploadedAt: "2026-10-01T12:00:00.000Z",
      });
    }

    it("COORDENADOR sem membership abre a linha pedida, aprova, e a linha vira 'Concluída'", async () => {
      const user = userEvent.setup({ delay: null });
      seedProofFor403();

      // Fase 1 — membro gestor pede (DEC-76).
      mocks.memberRoles = { 4: ["GERENTE_PROJETO"] };
      const first = renderPanel(true, 99);
      await screen.findByDisplayValue("Redação final");
      await user.click(screen.getByRole("button", { name: "Conclusão da atividade 3" }));
      await user.click(await screen.findByRole("button", { name: "Solicitar conclusão" }));
      await waitFor(() => expect(requestsFor("POST", "/activities/403/request-completion")).toHaveLength(1));
      first.unmount();

      // Fase 2 — COORDENADOR global SEM membership: não pede (DEC-77), mas aprova — e por isso
      // a linha abre para ele (o botão da linha obedece ao par "pedir OU aprovar").
      authMocks.user = { id: 9, name: "Coordenador", email: "coord@lab.com", roles: ["COORDENADOR"] };
      renderPanel(true, 99);
      await screen.findByDisplayValue("Redação final");
      await user.click(screen.getByRole("button", { name: "Conclusão da atividade 3" }));
      await user.click(await screen.findByRole("button", { name: "Aprovar conclusão" }));

      await waitFor(() => expect(requestsFor("POST", "/activities/403/approve-completion")).toHaveLength(1));
      expect(await screen.findByText("Atividade concluída")).toBeInTheDocument();
      // O número é o do servidor (R7): 200 × 1,5 = 300 distribuídos.
      expect(screen.getByText("300 moedas distribuídas entre os membros do projeto.")).toBeInTheDocument();
      // A linha escreveu no lugar: DONE tem rótulo próprio, e o diálogo fechou.
      expect(screen.getByText("Concluída")).toBeInTheDocument();
    });

    it("GERENTE não aprova o que ele mesmo pediu — sem botão de aprovar no diálogo (DEC-77)", async () => {
      const user = userEvent.setup({ delay: null });
      seedProofFor403();
      authMocks.user = { id: 4, name: "Gerente", email: "ger@lab.com", roles: ["GERENTE"] };
      mocks.memberRoles = { 4: ["GERENTE_PROJETO"] };
      renderPanel(true, 99);
      await screen.findByDisplayValue("Redação final");

      await user.click(screen.getByRole("button", { name: "Conclusão da atividade 3" }));
      await user.click(await screen.findByRole("button", { name: "Solicitar conclusão" }));
      await waitFor(() => expect(requestsFor("POST", "/activities/403/request-completion")).toHaveLength(1));

      // Reabre a linha pedida por ele mesmo: a prova (única no diálogo) prova que reabriu, e o
      // botão de aprovar não existe para quem pediu (a mesma função do domínio decide, DEC-92).
      await user.click(screen.getByRole("button", { name: "Conclusão da atividade 3" }));
      expect(await screen.findByText("rascunho.pdf")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Aprovar conclusão" })).not.toBeInTheDocument();
      expect(requestsFor("POST", "/activities/403/approve-completion")).toHaveLength(0);
    });

    it("quem não pede nem aprova não vê o botão da linha", async () => {
      // VOLUNTARIO sem membership e sem papel global: nenhuma das duas portas (DEC-76/77).
      renderPanel(true, 99);
      await screen.findByDisplayValue("Redação final");
      expect(screen.queryByRole("button", { name: "Conclusão da atividade 3" })).not.toBeInTheDocument();
    });
  });
});
