/**
 * V6-11h — fila de aprovação na aba Tarefas (pedido do dono, 2026-10-17).
 *
 * A aba Tarefas do painel foi concebida como fila de aprovação ("Visualize, filtre e
 * aprove tarefas em revisão"), mas abria com a lista inteira de tarefas (all) e, sem
 * nada em revisão, nada era acionável. Caracterização: a aba abre com o filtro
 * "Em Revisão" — só o que aguarda aprovação aparece; as demais listas seguem
 * alcançáveis pelo filtro de status.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { ModernAdminPanel } from "@/components/admin/ModernAdminPanel";
import { ProjectProvider } from "@/contexts/project-context";
import { UserProvider } from "@/contexts/user-context";
import { WorkSessionsProvider } from "@/contexts/work-sessions-context";
import { server } from "@/tests/mocks/server";

const mocks = vi.hoisted(() => ({
  tasks: [] as any[],
  approveTask: vi.fn(),
  rejectTask: vi.fn(),
  fetchTasks: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, name: "Coord", email: "c@lab.com", roles: ["COORDENADOR"] },
  }),
}));

vi.mock("@/contexts/task-context", () => ({
  useTask: () => ({
    tasks: mocks.tasks,
    loading: false,
    error: null,
    fetchTasks: mocks.fetchTasks,
    createTask: vi.fn(),
    createBacklog: vi.fn(),
    updateTask: vi.fn(),
    completeTask: vi.fn(),
    approveTask: mocks.approveTask,
    rejectTask: mocks.rejectTask,
    deleteTask: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

function taskFixture(overrides: Partial<any> & { id: number; title: string; status: string }) {
  return {
    description: null,
    priority: "medium",
    isGlobal: false,
    projectId: 1,
    ...overrides,
  };
}

function renderPanel() {
  render(
    <UserProvider>
      <ProjectProvider>
        <WorkSessionsProvider>
          <ModernAdminPanel
            users={[]}
            projects={[{ id: 1, name: "Projeto Um" }]}
            tasks={[]}
            sessions={[]}
            stats={{ totalUsers: 0, totalProjects: 0, totalTasks: 0, activeSessions: 0 }}
          />
        </WorkSessionsProvider>
      </ProjectProvider>
    </UserProvider>,
  );
}

beforeEach(() => {
  mocks.tasks = [];
  mocks.approveTask.mockReset();
  mocks.rejectTask.mockReset();
  mocks.fetchTasks = vi.fn();
  server.use(
    http.get("*/api/users/approve", () => HttpResponse.json({ pendingUsers: [] })),
    http.get("*/api/schedules", () => HttpResponse.json([])),
    http.get("*/api/tasks/global-progress", () => HttpResponse.json({ globalTasks: [] })),
    http.get("*/api/work-sessions", () => HttpResponse.json({ data: [] })),
    http.get("*/api/projects/*/volunteers", () =>
      HttpResponse.json({ volunteers: [], stats: { totalVolunteers: 0, totalHours: 0, completedTasks: 0, totalPoints: 0 } }),
    ),
  );
});

describe("a aba Tarefas abre como fila de aprovação", () => {
  it("o filtro inicial é 'Em Revisão': só o que aguarda aprovação aparece", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.tasks = [
      taskFixture({ id: 10, title: "Aprovar esta", status: "in-review" }),
      taskFixture({ id: 11, title: "Estoque em aberto", status: "to-do" }),
      taskFixture({ id: 12, title: "Já concluída", status: "done" }),
    ];
    renderPanel();

    await user.click(screen.getByRole("tab", { name: /tarefas/i }));

    expect(await screen.findByText("Aprovar esta")).toBeInTheDocument();
    expect(screen.getByText("1 tarefa(s)")).toBeInTheDocument();
    expect(screen.queryByText("Estoque em aberto")).not.toBeInTheDocument();
    expect(screen.queryByText("Já concluída")).not.toBeInTheDocument();
  });

  it("a fila vazia diz que não há nada em revisão, sem desmontar a aba", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.tasks = [taskFixture({ id: 11, title: "Estoque em aberto", status: "to-do" })];
    renderPanel();

    await user.click(screen.getByRole("tab", { name: /tarefas/i }));

    expect(await screen.findByText("Nenhuma tarefa encontrada para os filtros selecionados.")).toBeInTheDocument();
    expect(screen.queryByText("Estoque em aberto")).not.toBeInTheDocument();
  });

  it("voltar para 'Todos os status' traz a lista inteira", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.tasks = [
      taskFixture({ id: 10, title: "Aprovar esta", status: "in-review" }),
      taskFixture({ id: 11, title: "Estoque em aberto", status: "to-do" }),
    ];
    renderPanel();

    await user.click(screen.getByRole("tab", { name: /tarefas/i }));
    expect(await screen.findByText("Aprovar esta")).toBeInTheDocument();

    // Dois combobox no painel (status e projeto); o de status é o primeiro da fila.
    // combobox[0] é o "Exportar" do cabeçalho do painel; o de status está
    // com o valor selecionado "Em Revisão".
    await user.click(screen.getAllByRole("combobox").find((c) => c.textContent === "Em Revisão")!);
    // A lista do Radix aparece um frame depois da abertura e está com
    // pointer-events:none durante a animação — fireEvent ignora isso.
    const option = await screen.findByRole("option", { name: "Todos os status" }, { timeout: 3000 });
    fireEvent.click(option);

    expect(await screen.findByText("Estoque em aberto")).toBeInTheDocument();
    expect(screen.getByText("2 tarefa(s)")).toBeInTheDocument();
  });
});
