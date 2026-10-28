/**
 * plan-v9 S01 (ADR-001, R1, R4, CA4 parcial) — o Quadro de Liderança ordena pelo placar do mês.
 *
 * O contrato que este arquivo fecha:
 *  - a ordem do quadro é o placar do mês, não o saldo: quem tem 999 de saldo e 5 no mês fica atrás
 *    de quem tem 40 de saldo e 300 no mês;
 *  - a coluna "Pontos" da classificação mostra o placar do mês;
 *  - a página nomeia o mês que o servidor declarou (`/api/board`), porque mês civil não se calcula
 *    no navegador (DEC-132: `new Date("2026-10")` é UTC e deslocaria o rótulo para setembro).
 *
 * O escopo é a tela medida: pódio com `aria-label` próprio e a tabela de classificação. Os blocos
 * pessoais (posição, rival, barra) têm aceite próprio em S04.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const fixtures = vi.hoisted(() => ({
  // Saldo (points) e placar do mês (currentMonthPoints) deliberadamente divergentes.
  carla: {
    id: 22,
    name: "Carla Lima",
    email: "carla@test.local",
    roles: ["VOLUNTARIO"],
    points: 100,
    completedTasks: 4,
    status: "active",
    weekHours: 20,
    currentWeekHours: 0,
    currentMonthPoints: 150,
  },
  board: [
    {
      id: 21,
      name: "Bruno Rocha",
      email: "bruno@test.local",
      roles: ["VOLUNTARIO"],
      points: 40,
      completedTasks: 2,
      status: "active",
      weekHours: 20,
      currentWeekHours: 0,
      currentMonthPoints: 300,
    },
    {
      id: 23,
      name: "Ana Prado",
      email: "ana@test.local",
      roles: ["VOLUNTARIO"],
      points: 500,
      completedTasks: 9,
      status: "active",
      weekHours: 20,
      currentWeekHours: 0,
      currentMonthPoints: 10,
    },
    {
      id: 24,
      name: "Diego Serra",
      email: "diego@test.local",
      roles: ["VOLUNTARIO"],
      points: 999,
      completedTasks: 1,
      status: "active",
      weekHours: 20,
      currentWeekHours: 0,
      currentMonthPoints: 5,
    },
    {
      id: 25,
      name: "Elena Braga",
      email: "elena@test.local",
      roles: ["VOLUNTARIO"],
      points: 0,
      completedTasks: 0,
      status: "active",
      weekHours: 20,
      currentWeekHours: 0,
      currentMonthPoints: 1,
    },
    {
      id: 22,
      name: "Carla Lima",
      email: "carla@test.local",
      roles: ["VOLUNTARIO"],
      points: 100,
      completedTasks: 4,
      status: "active",
      weekHours: 20,
      currentWeekHours: 0,
      currentMonthPoints: 150,
    },
  ],
  boardMonth: { month: "2026-10", monthLabel: "outubro de 2026", track: "MONTH_POINTS" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: fixtures.carla, loading: false, logout: vi.fn() }),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({
    users: fixtures.board,
    loading: false,
    error: null,
    fetchUsers: vi.fn(),
    updateUser: vi.fn(),
    addPointsToUser: vi.fn(),
  }),
}));

const fetchAPI = vi.hoisted(() => vi.fn(async () => fixtures.boardMonth));
vi.mock("@/contexts/api-client", () => ({ fetchAPI, UsersAPI: {} }));

import LeaderboardPage from "@/app/(dashboard)/dashboard/leaderboard/page";

const boardSeed = structuredClone(fixtures.board);

describe("S01 — Quadro de Liderança pelo placar do mês", () => {
  beforeEach(() => {
    fetchAPI.mockClear();
    fixtures.board = structuredClone(boardSeed);
  });

  it("o campeão do quadro é quem tem mais placar no mês, não quem tem mais saldo", async () => {
    render(<LeaderboardPage />);
    const champion = await screen.findByRole("region", { name: "Campeão do quadro" });
    expect(within(champion).getByText("Bruno Rocha")).toBeInTheDocument();
    expect(within(champion).queryByText("Diego Serra")).not.toBeInTheDocument();
  });

  it("a classificação começa no 4º lugar e mostra o placar do mês na coluna de pontos", async () => {
    render(<LeaderboardPage />);
    const heading = await screen.findByRole("heading", { name: "Classificação completa" });
    const section = heading.closest("section") as HTMLElement;

    const rows = within(section).getAllByRole("row");
    const firstDataRow = rows[1];
    expect(within(firstDataRow).getByText("4º")).toBeInTheDocument();
    expect(within(firstDataRow).getByText("Diego Serra")).toBeInTheDocument();
    // Saldo 999 não entra na tela: o que aparece é o placar do mês.
    expect(within(firstDataRow).getByText("5")).toBeInTheDocument();
    expect(within(firstDataRow).queryByText("999")).not.toBeInTheDocument();
  });

  it("a página nomeia o mês declarado pelo servidor", async () => {
    render(<LeaderboardPage />);
    expect(await screen.findByText(/outubro de 2026/)).toBeInTheDocument();
    expect(fetchAPI).toHaveBeenCalledWith("/api/board");
  });

  it("usa o mesmo acento para o 2º e o 3º lugares e o raio do token no campeão", async () => {
    render(<LeaderboardPage />);
    const podium = await screen.findByRole("region", { name: "Segundo e terceiro lugares" });
    expect(within(podium).getByText("2º").className).toContain("text-warning");
    expect(within(podium).getByText("3º").className).toContain("text-warning");

    const champion = await screen.findByRole("region", { name: "Campeão do quadro" });
    const card = champion.querySelector("a");
    expect(card?.className).toContain("rounded-lg");
    expect(card?.className).not.toContain("rounded-2xl");
  });

  it("usa o primitivo EmptyState quando o placar do mês ainda está vazio", async () => {
    fixtures.board = boardSeed.map((person) => ({ ...person, currentMonthPoints: 0 }));
    render(<LeaderboardPage />);
    expect(await screen.findByText("Quadro vazio")).toBeInTheDocument();
    expect(screen.getByText("Placar de outubro de 2026. Abra o perfil de cada pessoa.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sua posição" })).not.toBeInTheDocument();
  });
});
