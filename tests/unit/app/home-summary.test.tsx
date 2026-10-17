import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * V6-3 (AC-V6-11, RF-V6.4 R1/R2, DEC-114) — a hierarquia da Home.
 *
 * O contrato:
 *  - PageHeader com saudacao (um unico h1 — AC-V6-04);
 *  - cabeçalho compacto, sem a fileira de métricas antes do quadro;
 *  - SEM coluna secundaria (DEC-114): nada de <aside>; o quadro ocupa a largura toda;
 *  - faixa com projetos, metas e estatísticas ACIMA do quadro (para as estatísticas
 *    aparecerem sem rolagem), sem fetch novo;
 *    sem "Atividade recente", sem "Status do sistema", sem ranking
 *    (DEC-112) — por isso o TaskBoard real e duplo: o teste prova o CABECALHO, e a
 *    rede de seguranca do quadro sao os 11 arquivos de features/tasks + o e2e.
 */

const fixtures = vi.hoisted(() => {
  const today = new Date();
  const todayDateOnly = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return {
    todayDateOnly,
    user: {
      id: 1,
      name: "Márcia Souza",
      email: "m@example.com",
      roles: ["COORDENADOR"],
      points: 1234,
      completedTasks: 3,
      status: "active",
      weekHours: 20,
      currentWeekHours: 0,
    },
    // 2 atrasadas + 1 para hoje + 3 concluídas + 1 neutra = 7 tasks
    tasks: [
      { id: 101, title: "vencida A", status: "to-do", dueDate: "2020-01-01" },
      { id: 102, title: "vencida B", status: "in-progress", dueDate: "2020-06-30" },
      { id: 103, title: "de hoje", status: "to-do", dueDate: todayDateOnly },
      { id: 104, title: "feita A", status: "done", dueDate: null },
      { id: 105, title: "feita B", status: "done", dueDate: "2020-01-01" },
      { id: 106, title: "feita C", status: "done", dueDate: null },
      { id: 107, title: "sem prazo", status: "to-do", dueDate: null },
    ],
    projects: [
      { id: 1, name: "Alfa", createdAt: "2026-10-13T12:00:00.000Z", status: "active" },
      { id: 2, name: "Beta", createdAt: "2026-10-12T12:00:00.000Z", status: "active" },
      { id: 3, name: "Gama", createdAt: "2026-10-11T12:00:00.000Z", status: "completed" },
      { id: 4, name: "Delta", createdAt: "2026-10-10T12:00:00.000Z", status: "archived" },
    ],
  };
});

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: fixtures.user, logout: () => {} }),
}));

vi.mock("@/features/tasks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/tasks")>();
  return {
    ...actual,
    useTasks: () => ({
      data: fixtures.tasks as never,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
  };
});

vi.mock("@/features/projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/projects")>();
  return {
    ...actual,
    useProjects: () => ({ data: fixtures.projects as never, isPending: false, error: null }),
  };
});

vi.mock("@/features/tasks/components/task-board", () => ({
  TaskBoard: () => <div data-testid="task-board" />,
}));

vi.mock("nuqs", () => ({
  parseAsBoolean: { withDefault: () => ({}) },
  parseAsInteger: {},
  parseAsString: { withDefault: () => ({}) },
  useQueryState: (key: string) => [
    key === "atrasadas" || key === "hoje" ? false : key === "busca" ? "" : null,
    vi.fn(),
  ],
}));

import DashboardPage from "@/app/(dashboard)/dashboard/page";

describe("Home — regiao de cabecalho (AC-V6-11)", () => {
  it("tem saudacao e UM unico h1 (AC-V6-04)", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Olá, Márcia!");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("mantém o cabeçalho compacto sem a fileira de cinco cartões no topo", () => {
    const { container } = render(<DashboardPage />);
    const main = container.querySelector("main");
    expect(main?.firstElementChild).not.toBeNull();
    expect(main?.firstElementChild?.querySelector(".grid")).toBeNull();
    expect(screen.queryByText("Atrasadas")).not.toBeInTheDocument();
    expect(screen.queryByText("Para hoje")).not.toBeInTheDocument();
  });

  it("NAO ha coluna secundaria (DEC-114) — o quadro fica na largura toda", () => {
    const { container } = render(<DashboardPage />);
    expect(container.querySelector("aside")).toBeNull();
    expect(screen.getByTestId("task-board")).toBeInTheDocument();
  });

  it("a faixa complementar fica acima do quadro, para as estatísticas aparecerem sem rolagem", () => {
    render(<DashboardPage />);
    const board = screen.getByTestId("task-board");
    const overview = screen.getByRole("region", { name: "Resumo do laboratório" });
    expect(board.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("acrescenta projetos recentes, tarefas por status e atividade da semana acima do quadro (V6-11e)", () => {
    render(<DashboardPage />);
    const board = screen.getByTestId("task-board");
    const overview = screen.getByRole("region", { name: "Resumo do laboratório" });
    expect(overview).toHaveTextContent("Projetos recentes");
    expect(overview).toHaveTextContent("Tarefas por status");
    expect(overview).toHaveTextContent("Atividade da semana");
    expect(overview).toHaveTextContent("Meta da semana");
    expect(screen.getByRole("img", { name: "Distribuição das tarefas por status" })).toBeVisible();
    expect(screen.getByRole("img", { name: /Tarefas concluídas nos últimos 7 dias/ })).toBeVisible();
    expect(overview).toHaveTextContent("Alfa");
    expect(board.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(overview.querySelectorAll("a[href^='/dashboard/projetos/']")).toHaveLength(3);
  });
});
