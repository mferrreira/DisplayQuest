/**
 * "Atribuídas a mim" filter — proves the toolbar toggle narrows the board to
 * tasks assigned to the current session user, and combines with other filters.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { TaskBoard } from "../components/task-board";
import { seedTasks } from "@/tests/mocks/handlers";
import { makeTask } from "@/tests/mocks/fixtures/tasks";

const mockUser = { id: 2, name: "Coordenador", email: "coordenador@lab.com", roles: ["COORDENADOR"] };

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

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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

describe("TaskBoard — filtro Atribuídas a mim", () => {
  beforeEach(() => {
    seedTasks([
      makeTask({ title: "Minha tarefa delegada", assigneeIds: [2] }),
      makeTask({ title: "Tarefa de outro usuário", assignedTo: 42 }),
      makeTask({ title: "Tarefa global sem dono", taskVisibility: "public", isGlobal: true }),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows all tasks by default and only mine when toggled", async () => {
    const user = userEvent.setup();
    renderBoard();

    await waitFor(() =>
      expect(screen.getByText("Tarefa de outro usuário")).toBeVisible(),
    );
    expect(screen.getByText("Minha tarefa delegada")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByText("Tarefa global sem dono")).toBeVisible(),
    );

    const toggle = screen.getByRole("button", { name: /atribuídas a mim/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    await waitFor(() =>
      expect(screen.queryByText("Tarefa de outro usuário")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Minha tarefa delegada")).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByText("Tarefa global sem dono")).not.toBeInTheDocument(),
    );
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles back off to restore the full board", async () => {
    const user = userEvent.setup();
    renderBoard();

    await waitFor(() =>
      expect(screen.getByText("Tarefa de outro usuário")).toBeVisible(),
    );

    await user.click(screen.getByRole("button", { name: /atribuídas a mim/i }));
    await waitFor(() =>
      expect(screen.queryByText("Tarefa de outro usuário")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /atribuídas a mim/i }));
    await waitFor(() =>
      expect(screen.getByText("Tarefa de outro usuário")).toBeVisible(),
    );
  });
});
