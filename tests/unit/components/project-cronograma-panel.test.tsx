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
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";

import { ProjectCronogramaPanel } from "@/components/features/project-cronograma-panel";
import {
  ACTIVITY_MIN_MONTH_MESSAGE,
  activityPeriod,
  activityReward,
  cronogramaMonthColumns,
  isActivityCurrent,
  monthKeysBetween,
  normalizeActivityDescription,
  normalizeGoalDescription,
  normalizeGoalTarget,
  toggleActivityMonthRange,
} from "@/backend/domain";

const PROJECT = 7;
const TODAY = "2026-10-15";
const START_DATE = "2026-03-01";
const END_DATE = "2026-08-31";

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
    },
  ];
  mocks.memberIds = [4];
  mocks.requests = [];
  mocks.refuseWrite = false;
  mocks.nextId = 700;
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
    requestedBy: null,
    requestedAt: null,
    approvedBy: null,
    approvedAt: null,
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
        roles: ["VOLUNTARIO"],
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

function renderPanel(canManage = true) {
  return render(
    <>
      <ProjectCronogramaPanel projectId={PROJECT} canManage={canManage} />
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

  it("linha nova só é escrita quando a descrição é confirmada, sem ordem no corpo", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel();
    await screen.findByDisplayValue("Revisão da literatura");

    await user.click(screen.getByRole("button", { name: "Adicionar atividade" }));
    // Sem descrição não há POST: linha vazia poluiria o cronograma e o domínio recusa.
    expect(requestsFor("POST", "/activities")).toHaveLength(0);

    const input = screen.getByLabelText("Descrição da atividade 3");
    await user.type(input, "Análise dos resultados");
    await user.tab();

    await waitFor(() => expect(requestsFor("POST", "/activities")).toHaveLength(1));
    const body = requestsFor("POST", "/activities")[0].json!;
    expect(body).toMatchObject({
      description: "Análise dos resultados",
      firstMonth: "2026-03",
      lastMonth: "2026-03",
      responsibleId: null,
    });
    // DEC-156d: a ordem é atribuída pelo servidor; a tela não manda número de linha.
    expect(body.order).toBeUndefined();
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
});
