/**
 * S01 (plan-v12, R1/R2, DEC-238) — a aba "Conclusões" no painel de admin.
 *
 * Por que existe: aprovar conclusão de atividade hoje exige entrar no projeto e abrir a linha
 * do cronograma. A fila global lista todas as solicitações, com prêmio previsto, e o botão
 * obedece o MESMO gate do domínio (`canActorApproveActivityCompletionDecision`): GERENTE não
 * aprova a linha que ele pediu, COORDENADOR aprova a dele.
 *
 * O que este arquivo congela:
 *   1. Gate da aba: `DASHBOARD_ADMIN` — GERENTE_PROJETO recebe o motivo, não conteúdo vazio.
 *   2. Linha renderizada: projeto, atividade, período, solicitante, prêmio previsto.
 *   3. Botão por regra: ausente na linha que o GERENTE pediu, presente nas outras; COORDENADOR
 *      aprova a própria.
 *   4. Aprovar chama a rota existente (`POST approve-completion`), toast lê `award` da resposta
 *      (R7 da casa: a tela não recalcula), linha sai da fila.
 *   5. Recusa: toast "Ação não permitida" com a frase do servidor; linha fica.
 *   6. Fila vazia tem estado vazio.
 *
 * Harness: o mesmo da fila de aprovação de tarefas (`tests/unit/components/admin/tasks-tab-queue.test.tsx`),
 * com `useAuth` mutável por caso. Toast: `<Toaster/>` de sonner montado local, com stub de
 * `matchMedia` local (lição do V4-5a: um shim global mudaria o caminho mobile dos testes do quadro).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";

import { ModernAdminPanel } from "@/components/admin/ModernAdminPanel";
import { ProjectProvider } from "@/contexts/project-context";
import { UserProvider } from "@/contexts/user-context";
import { WorkSessionsProvider } from "@/contexts/work-sessions-context";

const mocks = vi.hoisted(() => ({
  user: { id: 1, name: "Coord", email: "c@lab.com", roles: ["COORDENADOR"] } as {
    id: number;
    name: string;
    email: string;
    roles: string[];
  },
  rows: [] as any[],
  approveCalls: [] as string[],
  approveFail: null as null | { status: number; error: string },
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/contexts/task-context", () => ({
  useTask: () => ({
    tasks: [],
    loading: false,
    error: null,
    fetchTasks: vi.fn(),
    createTask: vi.fn(),
    createBacklog: vi.fn(),
    updateTask: vi.fn(),
    completeTask: vi.fn(),
    approveTask: vi.fn(),
    rejectTask: vi.fn(),
    deleteTask: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

function renderPanel() {
  render(
    <UserProvider>
      <ProjectProvider>
        <WorkSessionsProvider>
          <ModernAdminPanel
            users={[]}
            projects={[{ id: 10, name: "Pesquisa em IA" }]}
            tasks={[]}
            sessions={[]}
            stats={{ totalUsers: 0, totalProjects: 0, totalTasks: 0, activeSessions: 0 }}
          />
          {/* Sem isto nenhum toast chega ao DOM (medido no V4-5a). */}
          <Toaster />
        </WorkSessionsProvider>
      </ProjectProvider>
    </UserProvider>,
  );
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 10,
    projectName: "Pesquisa em IA",
    activityId: 1,
    order: 1,
    description: "Etapa 1",
    periodoInicio: "2026-04-01",
    periodoFim: "2026-06-30",
    requestedBy: 2,
    requestedByName: "Lívia",
    requestedAt: "2026-06-20T12:00:00.000Z",
    award: 450,
    ...overrides,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Fetch gravador, não MSW (lição medida do V5-2c e do floating-timer): o `fetch` que o jsdom
 * injeta não resolve confiável contra o MSW neste ambiente — o request fica pendente. O
 * gravador espelha as rotas reais: a fila devolve `requests`, aprovar devolve a economia da
 * resposta, a recusa devolve a frase do servidor.
 */
async function recordingFetch(input: unknown, init: RequestInit = {}) {
  const url = String(input);
  const method = init.method ?? "GET";

  if (url.endsWith("/api/admin/completion-requests")) {
    return jsonResponse({ requests: mocks.rows });
  }

  const approve = url.match(/\/api\/projects\/(\d+)\/activities\/(\d+)\/approve-completion$/);
  if (approve) {
    mocks.approveCalls.push(url);
    if (mocks.approveFail) {
      return jsonResponse({ error: mocks.approveFail.error }, mocks.approveFail.status);
    }
    return jsonResponse({
      activity: { id: Number(approve[2]), status: "DONE" },
      award: 450,
      shares: [{ userId: 2, points: 225 }],
      projectsPoints: 450,
    });
  }

  // Buscas que o painel dispara na montagem: respostas vazias.
  if (url.endsWith("/api/users/approve")) return jsonResponse({ pendingUsers: [] });
  if (url.endsWith("/api/schedules")) return jsonResponse([]);
  if (url.endsWith("/api/tasks/global-progress")) return jsonResponse({ globalTasks: [] });
  if (url.endsWith("/api/work-sessions")) return jsonResponse({ data: [] });
  if (url.includes("/volunteers")) {
    return jsonResponse({
      volunteers: [],
      stats: { totalVolunteers: 0, totalHours: 0, completedTasks: 0, totalPoints: 0 },
    });
  }

  throw new Error(`rota não prevista pelo gravador: ${method} ${url}`);
}

beforeEach(() => {
  mocks.user = { id: 1, name: "Coord", email: "c@lab.com", roles: ["COORDENADOR"] };
  mocks.rows = [row()];
  mocks.approveCalls = [];
  mocks.approveFail = null;
  vi.stubGlobal("fetch", vi.fn(recordingFetch));
  // O stub de `matchMedia` é local de propósito: um shim global em tests/setup.ts mudaria o
  // caminho "mobile" dos testes do quadro, que hoje dependem de ele NÃO existir.
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openQueueTab() {
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole("tab", { name: /conclusões/i }));
  return user;
}

describe("aba Conclusões — gate e linha", () => {
  it("GERENTE_PROJETO recebe o motivo da aba, não conteúdo vazio", async () => {
    mocks.user = { id: 3, name: "GP", email: "gp@lab.com", roles: ["GERENTE_PROJETO"] };
    renderPanel();
    await openQueueTab();

    expect(await screen.findByText("Acesso Restrito")).toBeInTheDocument();
    expect(screen.getByText(/DASHBOARD_ADMIN/)).toBeInTheDocument();
    expect(screen.queryByText("Etapa 1")).not.toBeInTheDocument();
  });

  it("COORDENADOR vê a linha com projeto, atividade, período, solicitante e prêmio previsto", async () => {
    renderPanel();
    await openQueueTab();

    // O primeiro request pago ao MSW nesta suíte custa ~1 s (boot da interceptação) — o
    // `findByText` de 1000 ms não espera. Timeout maior, não shim.
    expect(await screen.findByText("Etapa 1", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText("Pesquisa em IA")).toBeInTheDocument();
    expect(screen.getByText(/Solicitada por Lívia em 20\/06\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/01\/04\/2026 a 30\/06\/2026/)).toBeInTheDocument();
    expect(screen.getByText("Prêmio previsto: 450 pts")).toBeInTheDocument();
  });

  it("a fila vazia diz que não há solicitação, sem desmontar a aba", async () => {
    mocks.rows = [];
    renderPanel();
    await openQueueTab();

    expect(await screen.findByText("Nenhuma conclusão solicitada", {}, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe("aba Conclusões — botão por regra do gate", () => {
  it("GERENTE não tem botão na linha que ele pediu, tem nas outras", async () => {
    mocks.user = { id: 5, name: "Ger", email: "g@lab.com", roles: ["GERENTE"] };
    mocks.rows = [
      row({ activityId: 1, requestedBy: 5, requestedByName: "Ger" }),
      row({ activityId: 2, order: 2, description: "Etapa 2", requestedBy: 2, requestedByName: "Lívia" }),
    ];
    renderPanel();
    await openQueueTab();

    expect(await screen.findByText("Etapa 1", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar conclusão da atividade 1 do projeto Pesquisa em IA" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar conclusão da atividade 2 do projeto Pesquisa em IA" })).toBeInTheDocument();
  });

  it("COORDENADOR aprova a própria solicitação", async () => {
    mocks.user = { id: 1, name: "Coord", email: "c@lab.com", roles: ["COORDENADOR"] };
    mocks.rows = [row({ activityId: 1, requestedBy: 1, requestedByName: "Coord" })];
    renderPanel();
    await openQueueTab();

    expect(await screen.findByText("Etapa 1", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar conclusão da atividade 1 do projeto Pesquisa em IA" })).toBeInTheDocument();
  });
});

describe("aba Conclusões — aprovar pela fila", () => {
  it("aprovar chama a rota existente, o toast lê o award da resposta, a linha sai da fila", async () => {
    renderPanel();
    const user = await openQueueTab();
    const button = await screen.findByRole("button", { name: "Aprovar conclusão da atividade 1 do projeto Pesquisa em IA" }, { timeout: 5000 });
    await user.click(button);

    await waitFor(() => expect(mocks.approveCalls[0]).toContain("/api/projects/10/activities/1/approve-completion"));
    expect(await screen.findByText("Atividade concluída", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("450 pontos distribuídos entre os membros do projeto.", {}, { timeout: 5000 })).toBeInTheDocument();
    await screen.findByText("Nenhuma conclusão solicitada", {}, { timeout: 5000 });
  });

  it("recusa chega como 'Ação não permitida' com a frase do servidor, e a linha fica", async () => {
    mocks.user = { id: 5, name: "Ger", email: "g@lab.com", roles: ["GERENTE"] };
    mocks.rows = [row({ activityId: 2, order: 2, description: "Etapa 2", requestedBy: 3, requestedByName: "Outro" })];
    mocks.approveFail = {
      status: 403,
      error: "Usuário não tem permissão para aprovar a conclusão desta atividade",
    };
    renderPanel();
    const user = await openQueueTab();
    const button = await screen.findByRole("button", { name: "Aprovar conclusão da atividade 2 do projeto Pesquisa em IA" }, { timeout: 5000 });
    await user.click(button);

    expect(await screen.findByText("Ação não permitida", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(
      await screen.findByText("Usuário não tem permissão para aprovar a conclusão desta atividade"),
    ).toBeInTheDocument();
    expect(screen.getByText("Etapa 2")).toBeInTheDocument();
  });
});
