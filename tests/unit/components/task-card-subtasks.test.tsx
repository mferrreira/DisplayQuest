/**
 * S08 (plan-v11, R8) + S03 (plan-v12, R8): subtasks no cartão — bloco neutro, sem texto.
 *
 * Por que existe: o bloco do cartão mostrou primeiro âmbar (aviso), depois neutro com a
 * frase "X subtask aberta" + contagem. O dono cortou o texto: o bloco é só CheckSquare e
 * a contagem "X/N concluídas". O aceite congela as classes, o ícone e o corte do texto,
 * com o harness do arquivo irmão de features (TaskBoard + MSW).
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
import { getTaskStore, resetTaskStore, seedTasks } from "@/tests/mocks/handlers";
import { makeTask } from "@/tests/mocks/fixtures/tasks";

// R11 (S11): o quadro abre no projeto do líder na primeira carga. Estes testes de cartão e diálogo
// de subtask operam sobre tarefas sem projeto, então o ator não lidera nem é membro de nenhum
// projeto do fixture (líderes 2 e 3) — o quadro fica na visão global.
const mockUser = { id: 4, name: "Coordenador", email: "coordenador@lab.com", roles: ["COORDENADOR"] };

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: () => ({ data: { user: mockUser, expires: "" }, status: "authenticated" }),
  };
});

function renderBoard() {
  // DEC-270: a primeira carga abre com a pessoa selecionada; o ator é assignee das tarefas semeadas.
  getTaskStore().forEach((t) => { t.assigneeIds = [...(t.assigneeIds ?? []), mockUser.id] });
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

  it("o bloco de subtasks é neutro: bg-muted + border-border, sem âmbar, só CheckSquare e a contagem", async () => {
    renderBoard();
    const counter = await screen.findByText("1/2 concluídas");
    const block = counter.closest("div.rounded-md");
    expect(block).not.toBeNull();
    expect(block!.className).toContain("bg-muted");
    expect(block!.className).toContain("border-border");
    expect(block!.className).not.toMatch(/warning/);
    expect(block!.querySelector("svg.lucide-alert-triangle")).toBeNull();
    expect(block!.querySelector("svg.lucide-square-check-big")).not.toBeNull();
    // S03 (dono): o texto "X subtask(s) aberta(s)" saiu do cartão.
    expect(block!.textContent).not.toMatch(/subtask/);
  });

  it("a contagem 'X/N concluídas' é o único texto do bloco, com o checkbox da aberta", async () => {
    renderBoard();
    const counter = await screen.findByText("1/2 concluídas");
    const block = counter.closest("div.rounded-md")!;
    expect(block).toHaveTextContent("1/2 concluídas");
    expect(screen.queryByText(/subtask aberta/)).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Concluir subtask Ajustar o zero" })).toBeInTheDocument();
  });
});
