/**
 * S08 (plan-v11, R8) — subtasks abertas no cartão têm visual neutro, não de aviso.
 *
 * Por que existe: o bloco do cartão usava âmbar (`bg-warning/10`, `border-warning/40`,
 * AlertTriangle). O dono pediu neutral (muted/card + CheckSquare) mantendo a contagem
 * "X/N concluídas". O aceite congela as classes do bloco e o ícone, com o harness do
 * arquivo irmão de features (TaskBoard + MSW).
 *
 * Lucide-react marca o svg com a classe `lucide-<nome>` — é assim que o aceite vê a
 * troca AlertTriangle → CheckSquare sem depender de texto do svg.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { TaskBoard } from "@/features/tasks/components/task-board";
import { resetTaskStore, seedTasks } from "@/tests/mocks/handlers";
import { makeTask } from "@/tests/mocks/fixtures/tasks";

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
        <NuqsTestingAdapter searchParams="">
          <TaskBoard />
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </SessionProvider>,
  );
}

describe("cartão — subtasks neutras (R8)", () => {
  beforeEach(() => {
    resetTaskStore();
    seedTasks([
      makeTask({
        id: 812,
        title: "Calibrar o sensor",
        status: "in-progress",
        assignedTo: 2,
        points: 15,
        subtasks: [
          { id: 901, taskId: 812, title: "Ligar a fonte", completed: true, completedAt: "2026-10-21T12:00:00.000Z" },
          { id: 902, taskId: 812, title: "Ajustar o zero", completed: false, completedAt: null },
        ],
      }),
    ]);
  });
  afterEach(() => {
    resetTaskStore();
  });

  it("o bloco de subtasks abertas é neutro: bg-muted + border-border, sem âmbar", async () => {
    renderBoard();
    const label = await screen.findByText("1 subtask aberta");
    const block = label.closest("div.rounded-md");
    expect(block).not.toBeNull();
    expect(block!.className).toContain("bg-muted");
    expect(block!.className).toContain("border-border");
    expect(block!.className).not.toMatch(/warning/);
    expect(block!.querySelector("svg.lucide-alert-triangle")).toBeNull();
    expect(block!.querySelector("svg.lucide-square-check-big")).not.toBeNull();
  });

  it("a contagem 'X/N concluídas' permanece, com o checkbox da aberta", async () => {
    renderBoard();
    const label = await screen.findByText("1 subtask aberta");
    const block = label.closest("div.rounded-md")!;
    expect(block).toHaveTextContent("1/2 concluídas");
    expect(screen.getByRole("checkbox", { name: "Concluir subtask Ajustar o zero" })).toBeInTheDocument();
  });
});
