/**
 * plan-v18 S03 (DEC-249, ADR-006, R3, C4) — /dashboard/leaderboard com duas abas.
 *
 * O que este arquivo trava:
 *  - a página tem as abas **Projetos** e **Pessoas**, e **Projetos** é a aba padrão;
 *  - a aba Projetos monta o `ProjectManagerDashboard` intacto com todos os projetos,
 *    todos os papéis, `scopeDescription` "Todos os projetos" e o seletor abrindo o
 *    detalhe do projeto (`/dashboard/projetos/<id>`);
 *  - a aba Pessoas é o ranking de hoje, intacto ("Sua posição" e pódio aparecem só
 *    quando a aba está ativa);
 *  - as duas abas são abertas a todo autenticado — um VOLUNTARIO vê as duas.
 *
 * Mocks no padrão dos testes da página (`leaderboard-personal-month.test.tsx`): contextos
 * por `vi.mock`, `fetchAPI` para os meses do board. `ProjectManagerDashboard` é stub para
 * o guard de wiring — o quadro em si tem testes próprios.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  authUser: { id: 1, name: "Voluntario", roles: ["VOLUNTARIO"], points: 30, completedTasks: 1 },
  projects: [{ id: 7, name: "Projeto Alfa" }],
  tasks: [{ id: 40, title: "Tarefa X" }],
  users: [{ id: 1, name: "Voluntario", currentMonthPoints: 30, completedTasks: 1 }],
}));

const stub = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: mocks.authUser, loading: false }) }));
vi.mock("@/contexts/user-context", () => ({ useUser: () => ({ users: mocks.users }) }));
vi.mock("@/contexts/project-context", () => ({ useProject: () => ({ projects: mocks.projects }) }));
vi.mock("@/contexts/task-context", () => ({ useTask: () => ({ tasks: mocks.tasks }) }));
vi.mock("@/components/features/project-manager-dashboard", () => ({
  ProjectManagerDashboard: (props: any) => {
    stub(props);
    return <div data-testid="project-dashboard" data-scope={props.scopeDescription} />;
  },
}));
vi.mock("@/contexts/api-client", () => ({
  fetchAPI: vi.fn(async () => ({ month: "2026-11", monthLabel: "novembro de 2026", entries: [] })),
}));

import LeaderboardPage from "@/app/(dashboard)/dashboard/leaderboard/page";

describe("Leaderboard com abas (plan-v18 S03)", () => {
  beforeEach(() => {
    stub.mockReset();
    mocks.push.mockReset();
  });

  it("duas abas, Projetos por primeiro e aba padrão", () => {
    render(<LeaderboardPage />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Projetos", "Pessoas"]);
    expect(screen.getByRole("tab", { name: "Projetos" })).toHaveAttribute("aria-selected", "true");
  });

  it("a aba Projetos monta o painel com todos os projetos, escrito neutro e rota de detalhe", () => {
    render(<LeaderboardPage />);
    expect(screen.getByTestId("project-dashboard")).toHaveAttribute("data-scope", "Todos os projetos");
    const props = stub.mock.calls[0][0];
    expect(props.projects).toEqual(mocks.projects);
    expect(props.tasks).toEqual(mocks.tasks);
    expect(props.users).toEqual(mocks.users);
    props.onProjectSelect({ id: 7, name: "Projeto Alfa" });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard/projetos/7");
  });

  it("a aba Pessoas é o ranking de hoje: o conteúdo aparece só com a aba ativa", async () => {
    render(<LeaderboardPage />);
    expect(screen.queryByText("Sua posição")).toBeNull();
    const tab = screen.getByRole("tab", { name: "Pessoas" });
    // Radix Tabs seleciona no `mousedown` (medido em 1.1.2: `click` sozinho não ativa).
    fireEvent.mouseDown(tab);
    expect(await screen.findByText("Sua posição")).toBeInTheDocument();
    expect(tab).toHaveAttribute("aria-selected", "true");
  });

  it("um voluntário vê as duas abas", () => {
    render(<LeaderboardPage />);
    expect(screen.getByRole("tab", { name: "Projetos" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pessoas" })).toBeInTheDocument();
  });

  it("um GERENTE_PROJETO vê as duas abas", () => {
    // C4 nomeia os dois papéis. A página não tem gate: a aba aberta não depende de papel.
    mocks.authUser.roles = ["GERENTE_PROJETO"];
    render(<LeaderboardPage />);
    expect(screen.getByRole("tab", { name: "Projetos" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pessoas" })).toBeInTheDocument();
    mocks.authUser.roles = ["VOLUNTARIO"];
  });
});
