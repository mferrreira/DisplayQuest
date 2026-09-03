import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SessionProvider } from "next-auth/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskBoard } from "../components/task-board";
import {
  resetTaskStore,
  resetUserStore,
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
    expect(screen.queryByText("Tarefa global")).not.toBeInTheDocument();
  });

  it("selecting another user filters to that user's tasks", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    await selectPerson("Outro Usuário");
    expect(screen.getByText("Tarefa de outro usuário")).toBeVisible();
    expect(screen.queryByText("Minha tarefa delegada")).not.toBeInTheDocument();
    expect(screen.queryByText("Tarefa global")).not.toBeInTheDocument();
  });

  it("combines the person filter with the overdue filter", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    await selectPerson("Coordenador (você)");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Somente atrasadas" }));
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

describe("TaskBoard — search (ícone de lupa expansível)", () => {
  beforeEach(() => {
    resetTaskStore();
    resetUserStore();
    seedTasks([
      { title: "Minha tarefa delegada", status: "to-do", assigneeIds: [2], taskVisibility: "delegated" },
      { title: "Minha tarefa atrasada", status: "to-do", assigneeIds: [2], taskVisibility: "delegated" },
    ]);
  });

  it("expands from the magnifier and filters by title", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Minha tarefa delegada")).toBeVisible());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Buscar tarefas" }));
    const input = screen.getByRole("textbox", { name: "Buscar tarefas por título" });
    await user.type(input, "atrasad");
    expect(screen.getByText("Minha tarefa atrasada")).toBeVisible();
    expect(screen.queryByText("Minha tarefa delegada")).not.toBeInTheDocument();
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
