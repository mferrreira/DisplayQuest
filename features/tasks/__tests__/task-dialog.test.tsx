import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SessionProvider } from "next-auth/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskBoard } from "../components/task-board";
import { resetTaskStore, resetUserStore, seedTasks } from "@/tests/mocks/handlers";

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

describe("TaskDialog — tabs de criação", () => {
  beforeEach(() => {
    resetTaskStore();
    resetUserStore();
    seedTasks([
      { title: "Tarefa editável", status: "to-do", assigneeIds: [2], taskVisibility: "delegated" },
    ]);
  });

  it("create mode shows the \"Nova tarefa\" and \"Inserir backlog\" tabs", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Tarefa editável")).toBeVisible());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Nova Tarefa" }));
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Nova tarefa", "Inserir backlog"]);
  });

  it("switching to the backlog tab shows the import textarea and counter", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Tarefa editável")).toBeVisible());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Nova Tarefa" }));
    await screen.findByRole("tab", { name: "Nova tarefa" });
    await user.click(screen.getByRole("tab", { name: "Inserir backlog" }));
    const textarea = await screen.findByRole("textbox", { name: "Lista de tarefas para importação" });
    expect(textarea).toBeVisible();
    expect(screen.getByText("0 tarefa(s) detectada(s)")).toBeVisible();
    expect(screen.getByRole("button", { name: /Inserir 0/ })).toBeDisabled();
    // typing a line enables the import button
    await user.type(textarea, "Comprar reagentes !alta");
    expect(screen.getByText("1 tarefa(s) detectada(s)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Inserir 1" })).toBeEnabled();
  });

  it("edit mode shows no tabs (form only)", async () => {
    renderBoard();
    await waitFor(() => expect(screen.getByText("Tarefa editável")).toBeVisible());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ações para Tarefa editável" }));
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
    expect(await screen.findByRole("heading", { name: "Editar Tarefa" })).toBeVisible();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    // form fields are present directly
    expect(screen.getByRole("textbox", { name: "Título" })).toBeVisible();
  });
});
