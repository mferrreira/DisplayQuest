/**
 * TaskBoard component tests (E2/T2.7) — MSW-backed (tests/mocks/handlers.ts).
 * Proves board behavior beyond pure functions: column distribution, state grid, move-menu rules.
 * Auth is stubbed at the next-auth boundary (session = coordenador: leader, sees all tasks).
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { TaskBoard } from "../components/task-board";
import { resetTaskStore, getTaskStore } from "@/tests/mocks/handlers";
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

describe("TaskBoard", () => {
  beforeEach(() => {
    resetTaskStore();
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
    await user.click(screen.getByRole("button", { name: /somente atrasadas/i }));
    expect(await screen.findByText("Nenhuma tarefa corresponde aos filtros")).toBeVisible();
    // two "Limpar filtros" exist (toolbar + empty state); use the empty-state one
    const emptyState = screen.getByText("Nenhuma tarefa corresponde aos filtros").parentElement!;
    await user.click(within(emptyState).getByRole("button", { name: /limpar filtros/i }));
    expect(screen.getByText("Checklist do laboratório")).toBeVisible();
  });

  it("move menu blocks non-leader from moving a done task (legacy rule parity)", async () => {
    // make the current user a plain researcher (non-leader)
    mockUser.roles = ["PESQUISADOR"];
    resetTaskStore();
    renderBoard();
    await waitFor(() => expect(screen.getByText("Tarefa concluída recente")).toBeVisible());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ações para Tarefa concluída recente" }));
    await user.click(screen.getByRole("menuitem", { name: /Em Andamento/i }));
    // blocked: task stays in Concluído column, no API call changes it
    expect(await screen.findByText("Tarefa concluída recente")).toBeVisible();
    expect(getTaskStore().find((t) => t.title === "Tarefa concluída recente")?.status).toBe("done");
    mockUser.roles = ["COORDENADOR"];
  });
});
