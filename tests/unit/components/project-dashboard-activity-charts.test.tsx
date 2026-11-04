// @vitest-environment jsdom
/**
 * plan-v13 S05 — a linha de gráficos de atividades da aba Dashboard, em uma linha colapsável
 * (regras 4 e 5 do MODELO).
 *
 * Congelam:
 *   - a linha fecha por padrão (SSR nasce fechada) e a preferência sobrevive em
 *     `dq:projetos-graficos-aberto`;
 *   - fechada, só o cabeçalho da linha; aberta, os três cards de atividade;
 *   - o botão obedece o mesmo padrão da Home: `aria-expanded` + `aria-controls` +
 *     rótulo "Ocultar"/"Mostrar";
 *   - o recorte são os MESMOS filtros do topo: o componente recebe os projetos filtrados e só
 *     conta atividades dos projetos que estão neles;
 *   - a seção "Projetos no recorte" permanece com a linha fechada.
 *
 * O jsdom desta base não tem `window.localStorage` (medição da casa em 2026-10-02) — o shim
 * Map é instalado no arquivo, como em `session-notes-draft.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ProjectManagerDashboard } from "@/components/features/project-manager-dashboard";
import type { Project } from "@/contexts/types";
import type { ActivityChartRow } from "@/features/projects/utils/activity-chart-rules";

vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: null }) }));

const KEY = "dq:projetos-graficos-aberto";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    },
  });
});

afterEach(() => {
  cleanup();
  delete (window as { localStorage?: unknown }).localStorage;
});

function project(id: number, name: string): Project {
  return { id, name, description: null, createdAt: "2026-01-01T00:00:00.000Z", createdBy: 1, status: "active" };
}

const P1 = project(1, "Pesquisa em IA");
const P2 = project(2, "Automação de Processos");

const rows: ActivityChartRow[] = [
  { id: 10, projectId: 1, order: 1, status: "OPEN", description: "Coleta de dados", firstMonth: "2026-09", lastMonth: "2026-10" },
  { id: 11, projectId: 1, order: 2, status: "DONE", description: "Treino do modelo", firstMonth: "2026-06", lastMonth: "2026-08" },
  { id: 12, projectId: 2, order: 1, status: "COMPLETION_REQUESTED", description: "Deploy da automação", firstMonth: "2026-10", lastMonth: "2026-12" },
];

function renderDashboard(projects: Project[], activities: ActivityChartRow[]) {
  render(<ProjectManagerDashboard projects={projects} tasks={[]} activities={activities} scopeDescription="Todos os projetos" />);
}

describe("linha de gráficos de atividades", () => {
  it("fechada por padrão: só o cabeçalho; os três cards não existem", () => {
    renderDashboard([P1, P2], rows);
    const toggle = screen.getByRole("button", { name: /mostrar/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "projetos-graficos");
    expect(screen.queryByText("Atividades por status")).not.toBeInTheDocument();
    expect(screen.queryByText("Atividades por mês")).not.toBeInTheDocument();
    expect(screen.queryByText("Atividades atrasadas")).not.toBeInTheDocument();
    expect(screen.getByText("Projetos no recorte")).toBeInTheDocument();
  });

  it("aberta pelo botão: os três cards aparecem, o rótulo vira Ocultar, a preferência é gravada", () => {
    renderDashboard([P1, P2], rows);
    fireEvent.click(screen.getByRole("button", { name: /mostrar/i }));

    expect(screen.getByText("Atividades por status")).toBeInTheDocument();
    expect(screen.getByText("Atividades por mês")).toBeInTheDocument();
    expect(screen.getByText("Atividades atrasadas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ocultar/i })).toHaveAttribute("aria-expanded", "true");
    expect(store.get(KEY)).toBe("true");
  });

  it("a preferência salva abre a linha na visita seguinte", () => {
    store.set(KEY, "true");
    renderDashboard([P1, P2], rows);
    expect(screen.getByText("Atividades por status")).toBeInTheDocument();
  });

  it("o recorte do topo vale: só atividades dos projetos filtrados entram na conta", () => {
    renderDashboard([P1], rows);
    fireEvent.click(screen.getByRole("button", { name: /mostrar/i }));

    // P1: 1 OPEN + 1 DONE. A COMPLETION_REQUESTED é do P2, fora do recorte.
    const statusCard = screen.getByText("Atividades por status").closest("div[class*=rounded-lg]")!;
    expect(statusCard).toHaveTextContent("Aberta");
    expect(statusCard).toHaveTextContent("Concluída");
    const done = statusCard.textContent!.match(/Concluída\D*(\d+)/)!;
    expect(Number(done[1])).toBe(1);
    expect(statusCard.textContent!).not.toMatch(/Solicitada\D*[1-9]/);
  });

  it("as atrasadas saem em até 5 linhas com projeto + etapa", () => {
    const late = rows.map((r, i) => ({ ...r, id: i + 20, projectId: 1, firstMonth: "2026-06", lastMonth: "2026-09" }));
    const extra = Array.from({ length: 4 }, (_, i) => ({
      id: 100 + i,
      projectId: 1,
      order: 10 + i,
      status: "OPEN",
      description: `Etapa ${i}`,
      firstMonth: "2026-08",
      lastMonth: "2026-09",
    }) as ActivityChartRow);
    renderDashboard([P1], [...late, ...extra]);
    fireEvent.click(screen.getByRole("button", { name: /mostrar/i }));

    const card = screen.getByText("Atividades atrasadas").closest("div[class*=rounded-lg]")!;
    const linhas = card.querySelectorAll("[data-overdue-line]");
    expect(linhas).toHaveLength(5);
    expect(card.textContent).toContain("Pesquisa em IA");
    expect(card.textContent).toContain("Coleta de dados");
  });
});
