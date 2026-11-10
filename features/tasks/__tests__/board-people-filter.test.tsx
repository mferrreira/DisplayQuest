import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SessionProvider } from "next-auth/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskBoard } from "../components/task-board";
import {
  resetProjectStore,
  resetTaskStore,
  resetUserStore,
  seedProjects,
  seedTasks,
  seedUsers,
} from "@/tests/mocks/handlers";

const mockUser = {
  id: 2,
  name: "Coordenador",
  email: "coordenador@lab.com",
  roles: ["COORDENADOR"],
};

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: () => ({ data: { user: mockUser, expires: "" }, status: "authenticated" }),
  };
});

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 5 * 60 * 1000, staleTime: 5 * 60 * 1000 } },
});

function renderBoard() {
  return render(
    <SessionProvider session={null}>
      <QueryClientProvider client={queryClient}>
        <NuqsTestingAdapter>
          <TaskBoard />
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </SessionProvider>,
  );
}

const isoYesterday = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

/**
 * Medido nesta base: o jsdom do Vitest **não tem `window.matchMedia`** (e `tests/setup.ts`
 * não instala), então quem decide desktop-vs-mobile no `BoardToolbar` é este stub — e sem
 * ele todo teste cairia no caminho "sem matchMedia", que é o mobile.
 *
 * O `delete` no `afterEach` devolve o ambiente ao estado medido (regra da casa, igual em
 * `tests/unit/components/points-catch-up.test.tsx`).
 */
function stubDesktopViewport(isDesktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: isDesktop && query.includes("min-width"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function uninstallMatchMedia() {
  delete (window as unknown as Record<string, unknown>).matchMedia;
}

/** Opens the people select and clicks the given option (waits for the users fetch). */
async function selectPerson(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Filtrar tarefas por pessoa" }));
  await user.click(await screen.findByRole("option", { name }));
}

describe("TaskBoard — filtro por pessoa (select de pessoas)", () => {
  beforeEach(() => {
    resetTaskStore();
    resetUserStore();
    // R11 (S11): o quadro abre no projeto do líder na primeira carga. Este teste é do filtro de
    // pessoa sobre tarefas sem projeto, então não há projetos — o coordenador fica na visão global.
    resetProjectStore();
    seedProjects([]);
    seedUsers([
      {
        id: 2,
        name: "Coordenador",
        email: "coordenador@lab.com",
        points: 100,
        completedTasks: 5,
        status: "active",
        weekHours: 20,
        roles: ["COORDENADOR"],
        profileVisibility: "public",
      },
      {
        id: 42,
        name: "Outro Usuário",
        email: "outro@lab.com",
        points: 10,
        completedTasks: 1,
        status: "active",
        weekHours: 10,
        roles: ["PESQUISADOR"],
        profileVisibility: "public",
      },
    ]);
    seedTasks([
      {
        title: "Minha tarefa delegada",
        status: "to-do",
        assigneeIds: [2],
        taskVisibility: "delegated",
      },
      {
        title: "Minha tarefa atrasada",
        status: "to-do",
        assigneeIds: [2],
        taskVisibility: "delegated",
        dueDate: isoYesterday(),
      },
      {
        title: "Tarefa de outro usuário",
        status: "to-do",
        assignedTo: 42,
        taskVisibility: "delegated",
      },
      {
        title: "Tarefa global",
        status: "to-do",
        isGlobal: true,
        taskVisibility: "public",
      },
    ]);
  });

  it("shows the current user second in the people select as \"(você)\"", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    await userEvent
      .setup()
      .click(screen.getByRole("combobox", { name: "Filtrar tarefas por pessoa" }));
    const options = await screen.findAllByRole("option");
    expect(options[0]).toHaveTextContent("Todas as pessoas");
    expect(options[1]).toHaveTextContent("Coordenador (você)");
    expect(options[2]).toHaveTextContent("Outro Usuário");
  });

  it("selecting the current user filters the board to my tasks only", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    await selectPerson("Coordenador (você)");
    expect(screen.getByText("Minha tarefa delegada")).toBeVisible();
    expect(screen.getByText("Minha tarefa atrasada")).toBeVisible();
    expect(screen.queryByText("Tarefa de outro usuário")).not.toBeInTheDocument();
    // R10 (S10): quest global pública sem responsável é atribuída a todo usuário, então
    // ela **entra** no filtro "você". O dado da coluna não muda — só a regra de leitura.
    expect(screen.getByText("Tarefa global")).toBeVisible();
  });

  it("selecting another user filters to that user's tasks", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    await selectPerson("Outro Usuário");
    expect(screen.getByText("Tarefa de outro usuário")).toBeVisible();
    expect(screen.queryByText("Minha tarefa delegada")).not.toBeInTheDocument();
    // R10 (S10): a quest global pública sem responsável vale para qualquer pessoa.
    expect(screen.getByText("Tarefa global")).toBeVisible();
  });

  it("combines the person filter with the overdue filter", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    await selectPerson("Coordenador (você)");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /vencimento/i }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Somente atrasadas" }));
    expect(screen.queryByText("Minha tarefa delegada")).not.toBeInTheDocument();
    expect(screen.getByText("Minha tarefa atrasada")).toBeVisible();
  });

  it("no longer renders the standalone \"Atribuídas a mim\" or \"Inserir backlog\" buttons", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    expect(
      screen.queryByRole("button", { name: /Atribuídas a mim/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Inserir backlog/i }),
    ).not.toBeInTheDocument();
  });
});

describe("TaskBoard — busca no mobile (toggle da lupa continua)", () => {
  beforeEach(() => {
    resetTaskStore();
    resetUserStore();
    resetProjectStore();
    seedProjects([]);
    stubDesktopViewport(false);
    seedTasks([
      { title: "Minha tarefa delegada", status: "to-do", assigneeIds: [2], taskVisibility: "delegated" },
      { title: "Minha tarefa atrasada", status: "to-do", assigneeIds: [2], taskVisibility: "delegated" },
    ]);
  });

  afterEach(uninstallMatchMedia);

  it("expands from the magnifier and filters by title", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    const user = userEvent.setup();
    // Fechado, o campo existe mas fica fora da ordem de tabulação — como era antes.
    expect(screen.getByRole("textbox", { name: "Buscar tarefas por título" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    await user.click(screen.getByRole("button", { name: "Buscar tarefas" }));
    const input = screen.getByRole("textbox", { name: "Buscar tarefas por título" });
    await user.type(input, "atrasad");
    expect(screen.getByText("Minha tarefa atrasada")).toBeVisible();
    expect(screen.queryByText("Minha tarefa delegada")).not.toBeInTheDocument();
  });

  it("collapses back to the magnifier when blur happens with an empty search", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Buscar tarefas" }));
    const input = screen.getByRole("textbox", { name: "Buscar tarefas por título" });
    await user.click(input);
    await user.tab();
    expect(input).toHaveAttribute("tabindex", "-1");
  });

  it("clears the search via the X button", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Buscar tarefas" }));
    await user.type(screen.getByRole("textbox", { name: "Buscar tarefas por título" }), "atrasad");
    await user.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(screen.getByText("Minha tarefa delegada")).toBeVisible();
    expect(screen.getByText("Minha tarefa atrasada")).toBeVisible();
  });
});

describe("TaskBoard — busca no desktop (campo já aberto, sem toggle)", () => {
  beforeEach(() => {
    resetTaskStore();
    resetUserStore();
    resetProjectStore();
    seedProjects([]);
    stubDesktopViewport(true);
    seedTasks([
      { title: "Minha tarefa delegada", status: "to-do", assigneeIds: [2], taskVisibility: "delegated" },
      { title: "Minha tarefa atrasada", status: "to-do", assigneeIds: [2], taskVisibility: "delegated" },
    ]);
  });

  afterEach(uninstallMatchMedia);

  it("filters by title without opening the magnifier first", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    const input = screen.getByRole("textbox", { name: "Buscar tarefas por título" });
    // O campo nasce aberto e **focável**: é o que o teclado precisa, já que a lupa some
    // em `sm:`. Sem este `tabindex`, o desktop ficaria sem busca por teclado nenhum.
    expect(input).toHaveAttribute("tabindex", "0");
    await userEvent.setup().type(input, "atrasad");
    expect(screen.getByText("Minha tarefa atrasada")).toBeVisible();
    expect(screen.queryByText("Minha tarefa delegada")).not.toBeInTheDocument();
  });

  it("does not collapse on blur with an empty search", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    const user = userEvent.setup();
    const input = screen.getByRole("textbox", { name: "Buscar tarefas por título" });
    await user.click(input);
    await user.tab();
    expect(input).toHaveAttribute("tabindex", "0");
    // Campo vazio e aberto não tem o que limpar, então o X não aparece.
    expect(screen.queryByRole("button", { name: "Limpar busca" })).not.toBeInTheDocument();
  });
});
