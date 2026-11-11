import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SessionProvider } from "next-auth/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskBoard } from "@/features/tasks/components/task-board";
import {
  resetProjectStore,
  resetTaskStore,
  resetUserStore,
  seedProjects,
  seedTasks,
  seedUsers,
} from "@/tests/mocks/handlers";

/**
 * plan-v23 S06 (DEC-270): primeira carga do quadro sem `?pessoa=`. O quadro abre com a
 * pessoa selecionada — só as tarefas atribuídas à pessoa ficam visíveis — e o seletor de
 * projeto nasce em "Todos os projetos". O seletor de pessoa já abre com o nome da pessoa.
 * "Todas as pessoas" devolve as tarefas dos projetos. A regra R11 de abertura por projeto
 * morre com a DEC-270; a volta ao global por projeto continua sendo a opção do seletor.
 *
 * jsdom não tem `window.matchMedia` (regra da casa), e a busca é desktop-first: sem o stub
 * o quadro cai no caminho mobile. Este teste é desktop.
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

const actor = vi.hoisted(() => ({ id: 2, roles: ["GERENTE_PROJETO"] as string[] }));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: actor.id, name: `User ${actor.id}`, email: `u${actor.id}@lab.com`, roles: actor.roles }, loading: false }),
}));

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  const user = { id: actor.id, name: `User ${actor.id}`, email: `u${actor.id}@lab.com`, roles: actor.roles };
  return { ...actual, useSession: () => ({ data: { user, expires: "" }, status: "authenticated" }) };
});

function renderBoard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <SessionProvider session={null}>
      <QueryClientProvider client={qc}>
        <NuqsTestingAdapter>
          <TaskBoard />
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </SessionProvider>,
  );
}

describe("TaskBoard — pessoa inicial do quadro (DEC-270)", () => {
  beforeEach(() => {
    resetProjectStore();
    resetTaskStore();
    resetUserStore();
    stubDesktopViewport(true);
    actor.id = 2;
    actor.roles = ["VOLUNTARIO"];
    seedUsers([
      { id: 2, name: "Línea", email: "linea@lab.com", points: 5, completedTasks: 1, status: "active", weekHours: 10, roles: ["VOLUNTARIO"], profileVisibility: "public" },
      { id: 5, name: "Membro", email: "membro@lab.com", points: 5, completedTasks: 1, status: "active", weekHours: 10, roles: ["VOLUNTARIO"], profileVisibility: "public" },
    ]);
    seedProjects([
      { id: 1, name: "Projeto da Línea", createdBy: 2, leaderId: 2, status: "active", createdAt: "2026-01-01", isMember: true },
      { id: 2, name: "Projeto do Membro", createdBy: 5, leaderId: 5, status: "active", createdAt: "2026-02-01", isMember: false },
    ]);
    seedTasks([
      { id: 10, title: "Tarefa da Línea", status: "to-do", projectId: 1, assignedTo: 2, assigneeIds: [2] },
      { id: 20, title: "Tarefa do Membro", status: "to-do", projectId: 2, assignedTo: 5, assigneeIds: [5] },
      { id: 30, title: "Quest global da Línea", status: "to-do", projectId: null, assignedTo: 2, assigneeIds: [2] },
    ]);
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).matchMedia;
  });

  it("em primeira carga sem URL, só as tarefas atribuídas à pessoa ficam visíveis", async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText("Tarefa da Línea")).toBeVisible();
      expect(screen.getByText("Quest global da Línea")).toBeVisible();
    });
    expect(screen.queryByText("Tarefa do Membro")).not.toBeInTheDocument();
  });

  it("o seletor de pessoa abre já com o nome da pessoa e o de projeto em 'Todos os projetos'", async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText("Tarefa da Línea")).toBeVisible();
    });
    expect(screen.getByText("Línea (você)")).toBeInTheDocument();
    expect(screen.getByText("Todos os projetos")).toBeInTheDocument();
  });

  it("'Todas as pessoas' devolve as tarefas dos projetos", async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText("Tarefa da Línea")).toBeVisible();
    });
    expect(screen.queryByText("Tarefa do Membro")).not.toBeInTheDocument();

    const trigger = screen.getByLabelText("Filtrar tarefas por pessoa");
    fireEvent.click(trigger);
    const allOption = await screen.findByRole("option", { name: "Todas as pessoas" });
    fireEvent.click(allOption);

    await waitFor(() => {
      expect(screen.getByText("Tarefa do Membro")).toBeVisible();
      expect(screen.getByText("Tarefa da Línea")).toBeVisible();
    });
  });

  it("não há chip extra no cabeçalho", async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText("Tarefa da Línea")).toBeVisible();
    });
    expect(screen.queryByRole("button", { name: "Ver todos os projetos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver todas as pessoas" })).not.toBeInTheDocument();
  });

  it("a pessoa escolhida no seletor troca o recorte sem escrever a URL na abertura", async () => {
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText("Tarefa da Línea")).toBeVisible();
    });

    const trigger = screen.getByLabelText("Filtrar tarefas por pessoa");
    fireEvent.click(trigger);
    const membroOption = await screen.findByRole("option", { name: "Membro" });
    fireEvent.click(membroOption);

    await waitFor(() => {
      expect(screen.getByText("Tarefa do Membro")).toBeVisible();
    });
    expect(screen.queryByText("Tarefa da Línea")).not.toBeInTheDocument();
    expect(screen.queryByText("Quest global da Línea")).not.toBeInTheDocument();
  });
});
