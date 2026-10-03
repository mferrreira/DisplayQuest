/**
 * TaskBoard component tests (E2/T2.7) — MSW-backed (tests/mocks/handlers.ts).
 * Proves board behavior beyond pure functions: column distribution, state grid, move-menu rules.
 * Auth is stubbed at the next-auth boundary (session = coordenador: leader, sees all tasks).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { TaskBoard } from "../components/task-board";
import { resetTaskStore, getTaskStore, seedTasks } from "@/tests/mocks/handlers";
import { server } from "@/tests/mocks/server";

// next-auth/react useSession is mocked (SessionProvider alone would need a real session flow)
const mockUser = { id: 2, name: "Coordenador", email: "coordenador@lab.com", roles: ["COORDENADOR"] };

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: () => ({ data: { user: mockUser, expires: "" }, status: "authenticated" }),
  };
});

function renderBoard(initialSearchParams?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <SessionProvider session={null}>
      <QueryClientProvider client={queryClient}>
        <NuqsTestingAdapter searchParams={initialSearchParams}>
          <TaskBoard />
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </SessionProvider>,
  );
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Medido nesta base (2026-10-02): no jsdom do Vitest, `window === globalThis` e
 * **`window.localStorage` é `undefined`** — o `populateGlobal` não copia a Web Storage do jsdom.
 * A ordenação da coluna é guardada em `localStorage`, então o teste instala um em memória: sem
 * ele, os casos de preferência estariam medindo só o caminho de SSR (sem storage), que é o
 * mesmo do servidor.
 */
let storageData: Map<string, string>;

function installMemoryStorage() {
  storageData = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (storageData.has(key) ? (storageData.get(key) as string) : null),
    setItem: (key: string, value: string) => storageData.set(key, value),
    removeItem: (key: string) => storageData.delete(key),
    clear: () => storageData.clear(),
    key: () => null,
    get length() {
      return storageData.size;
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
}

/** Ordem dos cartões de uma coluna, lida pelo rótulo do botão de ações de cada cartão. */
function titlesInColumn(columnTitle: string): string[] {
  return within(screen.getByLabelText(`Coluna ${columnTitle}`))
    .getAllByRole("button", { name: /^Ações para / })
    .map((button) => (button.getAttribute("aria-label") as string).replace(/^Ações para /, ""));
}

describe("TaskBoard", () => {
  beforeEach(() => {
    resetTaskStore();
    installMemoryStorage();
  });

  afterEach(() => {
    // `delete` devolve o ambiente ao estado medido (sem localStorage).
    delete (window as unknown as Record<string, unknown>).localStorage;
  });

  it("renders fixture tasks distributed across columns", async () => {
    renderBoard();
    // fixture: 4 in A Fazer (ids 1,2,6 + none archived), 1 Em Andamento, 1 Em Revisão, 1 Ajustes, 1 Concluído
    await waitFor(() => expect(screen.getByText("Checklist do laboratório")).toBeVisible());
    expect(screen.getByText("Documentar API de sessões")).toBeVisible();
    expect(screen.getByText("Revisar sensor de temperatura")).toBeVisible();
    expect(screen.getByText("Quest global: organizar bancada")).toBeVisible();
    // column headers with counts
    expect(screen.getByText("A Fazer")).toBeVisible();
    expect(screen.getByText("Concluído")).toBeVisible();
    // archived task (12 days old) lands in history section
    expect(await screen.findByText(/1 concluída\(s\) há mais de 1 semana/)).toBeVisible();
  });

  it("shows filtered-empty state when overdue filter matches nothing after clearing", async () => {
    // store has overdue tasks; flip store to none overdue by reseeding with future dates
    resetTaskStore();
    const store = getTaskStore();
    store.forEach((t) => (t.dueDate = null));
    renderBoard();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Checklist do laboratório")).toBeVisible());
    await user.click(screen.getByRole("button", { name: /vencimento/i }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /somente atrasadas/i }));
    expect(await screen.findByText("Nenhuma tarefa corresponde aos filtros")).toBeVisible();
    // two "Limpar filtros" exist (toolbar + empty state); use the empty-state one
    const emptyState = screen.getByText("Nenhuma tarefa corresponde aos filtros").parentElement!;
    await user.click(within(emptyState).getByRole("button", { name: /limpar filtros/i }));
    expect(screen.getByText("Checklist do laboratório")).toBeVisible();
  });

  it("due-today filter shows only today's tasks, OR-combines with overdue, and ?hoje=true preselects it", async () => {
    seedTasks([
      { id: 101, title: "Tarefa vencida ontem", status: "to-do", dueDate: "2020-01-01" },
      { id: 102, title: "Tarefa vence hoje", status: "to-do", dueDate: todayIso() },
      { id: 103, title: "Tarefa futura", status: "to-do", dueDate: "2099-12-31" },
    ]);
    renderBoard();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("Tarefa vence hoje")).toBeVisible());

    // Only "Para hoje": yesterday's + future hidden
    await user.click(screen.getByRole("button", { name: /vencimento/i }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Para hoje" }));
    await waitFor(() => expect(screen.queryByText("Tarefa vencida ontem")).not.toBeInTheDocument());
    expect(screen.queryByText("Tarefa futura")).not.toBeInTheDocument();
    expect(screen.getByText("Tarefa vence hoje")).toBeVisible();

    // OR: enabling "Somente atrasadas" too shows yesterday's as well, still not future
    await user.click(screen.getByRole("button", { name: /vencimento/i }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /somente atrasadas/i }));
    await waitFor(() => expect(screen.getByText("Tarefa vencida ontem")).toBeVisible());
    expect(screen.getByText("Tarefa vence hoje")).toBeVisible();
    expect(screen.queryByText("Tarefa futura")).not.toBeInTheDocument();
  });

  it("preselects Para hoje from ?hoje=true URL", async () => {
    seedTasks([
      { id: 201, title: "Tarefa vence hoje", status: "to-do", dueDate: todayIso() },
      { id: 202, title: "Tarefa futura", status: "to-do", dueDate: "2099-12-31" },
    ]);
    renderBoard("?hoje=true");
    await waitFor(() => expect(screen.getByText("Tarefa vence hoje")).toBeVisible());
    expect(screen.queryByText("Tarefa futura")).not.toBeInTheDocument();
  });

  it("plan-v3 OND3-B: o menu de tarefa concluída não oferece destino a não-líder", async () => {
    // Antes: as quatro colunas apareciam e todas voltavam com "Ação não permitida" — o
    // arrasto de `done` é desabilitado, então o menu era o único caminho possível.
    mockUser.roles = ["PESQUISADOR"];
    resetTaskStore();
    renderBoard();
    await waitFor(() => expect(screen.getByText("Tarefa concluída recente")).toBeVisible());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ações para Tarefa concluída recente" }));

    for (const column of ["A Fazer", "Em Andamento", "Em Revisão", "Ajustes"]) {
      expect(screen.queryByRole("menuitem", { name: column })).not.toBeInTheDocument();
    }
    const aviso = screen.getByRole("menuitem", { name: /só volta de coluna para líderes/i });
    expect(aviso).toHaveAttribute("data-disabled");
    // o resto do menu continua: ver detalhes e editar não dependem de coluna
    expect(screen.getByRole("menuitem", { name: /ver detalhes/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /editar/i })).toBeInTheDocument();
    mockUser.roles = ["COORDENADOR"];
  });

  it("plan-v3 OND3-B: o menu compacto tem a mesma regra (a duplicação do menu já custou uma regra pela metade)", async () => {
    mockUser.roles = ["PESQUISADOR"];
    resetTaskStore();
    renderBoard("?visao=compacta");
    await waitFor(() => expect(screen.getByText("Tarefa concluída recente")).toBeVisible());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ações para Tarefa concluída recente" }));

    expect(screen.getByRole("menuitem", { name: /só volta de coluna para líderes/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Ajustes" })).not.toBeInTheDocument();
    mockUser.roles = ["COORDENADOR"];
  });

  it("plan-v3 OND3-B: o líder continua vendo todos os destinos da tarefa concluída", async () => {
    resetTaskStore();
    renderBoard();
    await waitFor(() => expect(screen.getByText("Tarefa concluída recente")).toBeVisible());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ações para Tarefa concluída recente" }));

    for (const column of ["A Fazer", "Em Andamento", "Em Revisão", "Ajustes"]) {
      expect(await screen.findByRole("menuitem", { name: column })).toBeEnabled();
    }
    expect(screen.queryByRole("menuitem", { name: /só volta de coluna/i })).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------------------
  // plan-v3 OND3-C — ordenação por coluna
  //
  // As duas colunas do fixture são montadas para que **urgência** e **prazo** discordem nas duas:
  // em "A Fazer" o urgente vence a data, em "Em Andamento" a data vence a urgência. Assim o caso
  // distingue trocar a ordem de trocar a lista inteira.
  // ---------------------------------------------------------------------------------------
  function seedOrderFixture() {
    seedTasks([
      { id: 11, title: "A Fazer sem prazo", status: "to-do", dueDate: null, priority: "low" },
      { id: 12, title: "A Fazer urgente", status: "to-do", dueDate: "2026-12-31", priority: "urgent" },
      { id: 13, title: "A Fazer vencendo", status: "to-do", dueDate: "2026-10-05", priority: "low" },
      { id: 14, title: "Andamento urgente", status: "in-progress", dueDate: "2026-12-01", priority: "urgent" },
      { id: 15, title: "Andamento cedo", status: "in-progress", dueDate: "2026-10-01", priority: "low" },
    ]);
  }

  it("plan-v3 OND3-C: escolher a ordem reordena só a coluna escolhida", async () => {
    seedOrderFixture();
    renderBoard();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("A Fazer vencendo")).toBeVisible());

    // o padrão é urgência: o urgente vem antes, mesmo vencendo em dezembro
    expect(titlesInColumn("A Fazer")).toEqual(["A Fazer urgente", "A Fazer vencendo", "A Fazer sem prazo"]);

    await user.click(screen.getByRole("button", { name: "Ordenar tarefas de A Fazer" }));
    // o menu diz o que está valendo — não é um controle cego
    expect(screen.getByRole("menuitemradio", { name: "Urgência" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("menuitemradio", { name: "Prazo" }));

    expect(titlesInColumn("A Fazer")).toEqual(["A Fazer vencendo", "A Fazer urgente", "A Fazer sem prazo"]);
    // a outra coluna continua em urgência: a preferência é por coluna
    expect(titlesInColumn("Em Andamento")).toEqual(["Andamento urgente", "Andamento cedo"]);
  });

  it("plan-v3 OND3-C: a ordem escolhida sobrevive ao recarregar, guardada por pessoa", async () => {
    seedOrderFixture();
    const user = userEvent.setup();
    const first = renderBoard();
    await waitFor(() => expect(screen.getByText("A Fazer vencendo")).toBeVisible());
    await user.click(screen.getByRole("button", { name: "Ordenar tarefas de A Fazer" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Alfabética" }));
    expect(titlesInColumn("A Fazer")).toEqual([
      "A Fazer sem prazo",
      "A Fazer urgente",
      "A Fazer vencendo",
    ]);
    first.unmount();

    // `mockUser.id` é 2: a preferência é da pessoa, não do navegador inteiro
    expect(storageData.get("dq:column-order:2:to-do")).toBe('"alfabetica"');

    renderBoard();
    await waitFor(() => expect(screen.getByText("A Fazer vencendo")).toBeVisible());
    expect(titlesInColumn("A Fazer")).toEqual([
      "A Fazer sem prazo",
      "A Fazer urgente",
      "A Fazer vencendo",
    ]);
    // e o menu reabre marcando o que foi guardado
    await user.click(screen.getByRole("button", { name: "Ordenar tarefas de A Fazer" }));
    expect(screen.getByRole("menuitemradio", { name: "Alfabética" })).toHaveAttribute("aria-checked", "true");
  });

  it("plan-v3 OND3-C: storage de outra versão não derruba o quadro — volta ao padrão", async () => {
    // JSON válido que não é ordem ("prazo " com espaço) e JSON quebrado: os dois caem no padrão
    storageData.set("dq:column-order:2:to-do", '"prazo "');
    storageData.set("dq:column-order:2:in-progress", "{isto nao e json");
    seedOrderFixture();
    renderBoard();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText("A Fazer vencendo")).toBeVisible());

    expect(titlesInColumn("A Fazer")).toEqual(["A Fazer urgente", "A Fazer vencendo", "A Fazer sem prazo"]);
    await user.click(screen.getByRole("button", { name: "Ordenar tarefas de A Fazer" }));
    expect(screen.getByRole("menuitemradio", { name: "Urgência" })).toHaveAttribute("aria-checked", "true");
    for (const option of ["Prazo", "Mais recentes", "Pontos", "Alfabética"]) {
      expect(screen.getByRole("menuitemradio", { name: option })).toHaveAttribute("aria-checked", "false");
    }
  });
});
