/**
 * plan-v9 S04 (ADR-005, DEC-227) — o bloco "Sua posição" do Quadro de Liderança fala do MÊS.
 *
 * O contrato que este arquivo fecha:
 *  - a posição pessoal é a do placar do mês, com "de N pessoas" do quadro vivo;
 *  - o rival da frase de progresso é quem está À FRENTE na régua do fechado (valor desc, depois
 *    nome, depois id) — o empate com mesmo placar é rival com frase própria ("Empatado com X"),
 *    e a ordem de chegada da lista NÃO decide nada (a fixture chega com a autora do placar
 *    menor na frente com o mesmo valor, e o quadro tem de escolher pelo nome);
 *  - a barra contra o líder é a razão do placar do mês pelo placar do mês do líder (50% quando
 *    150 de 300).
 *
 * O escopo é a tela medida: pódio, classificação e os três textos do bloco pessoal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const fixtures = vi.hoisted(() => ({
  // A ordem da lista é ARRIVAL, não régua: Carla vem antes de Elena com o mesmo placar, e a
  // régua do quadro (nome) tem de colocar Elena na frente. Antes do ADR-005, o sort só por
  // valor deixava Carla à frente na ordem de chegada e o quadro dizia outro posto.
  diego: {
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
  bruno: {
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
  elena: {
    id: 25,
    name: "Elena Braga",
    email: "elena@test.local",
    roles: ["VOLUNTARIO"],
    points: 0,
    completedTasks: 0,
    status: "active",
    weekHours: 20,
    currentWeekHours: 0,
    currentMonthPoints: 140,
  },
  carla: {
    id: 22,
    name: "Carla Lima",
    email: "carla@test.local",
    roles: ["VOLUNTARIO"],
    points: 10,
    completedTasks: 4,
    status: "active",
    weekHours: 20,
    currentWeekHours: 0,
    currentMonthPoints: 150,
  },
  ana: {
    id: 23,
    name: "Ana Prado",
    email: "ana@test.local",
    roles: ["VOLUNTARIO"],
    points: 500,
    completedTasks: 9,
    status: "active",
    weekHours: 20,
    currentWeekHours: 0,
    currentMonthPoints: 150,
  },
  authUser: null as Record<string, unknown> | null,
  board: [] as Array<Record<string, unknown>>,
  boardMonth: { month: "2026-10", monthLabel: "outubro de 2026", track: "MONTH_POINTS" },
}));

const fetchAPI = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/api-client", () => ({ fetchAPI, UsersAPI: {} }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: fixtures.authUser, loading: false, logout: vi.fn() }),
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

import LeaderboardPage from "@/app/(dashboard)/dashboard/leaderboard/page";

/** Monta a tela com `authUser` lista da régua e ordem de chegada controlada. */
function beatingBoard(authUser: Record<string, unknown>) {
  fixtures.authUser = authUser;
  // Ordem de chegada PESADA: mesmo valor 150, Carla vem antes de Elena. A régua nomeia quem
  // fica na frente; a ordem da fixture não decide nada (este é o ponto do ADR-005).
  fixtures.board = [fixtures.carla, fixtures.diego, fixtures.elena, fixtures.ana, fixtures.bruno];
  fetchAPI.mockImplementation(async (url: string) => {
    if (typeof url === "string" && url.startsWith("/api/board")) return fixtures.boardMonth;
    throw new Error(`fetchAPI não esperou por ${url}`);
  });
}

describe("S04 — bloco pessoal pelo placar do mês", () => {
  beforeEach(() => {
    fetchAPI.mockReset();
  });

  it("a posição pessoal é a do mês na régua do fechado, empatada com a rival do mesmo placar", async () => {
    // Régua esperada: Bruno 300 (1º), empate em 150 → Ana Prado (2º, nome A antes de C na régua
    // do fechado) e Carla (3º), Elena 140 (4º), Diego 5 (5º). Carla na posição 3 — nem a 2ª da
    // ordem de chegada, nem a 4ª do saldo.
    beatingBoard(fixtures.carla);

    render(<LeaderboardPage />);

    const personal = await screen.findByRole("region", { name: "Sua posição" });
    expect(within(personal).getByText("3º")).toBeInTheDocument();
    expect(within(personal).getByText("de 5")).toBeInTheDocument();
    expect(within(personal).getByText("150 pontos · 4 tarefas concluídas")).toBeInTheDocument();

    // O rival é a pessoa À FRENTE na régua (Ana, mesmo placar 150) — a frase própria de empate.
    expect(within(personal).getByText("Empatado com Ana Prado.")).toBeInTheDocument();
  });

  it("a barra contra o líder é a razão do placar do mês (150 de 300 do líder = 50%)", async () => {
    beatingBoard(fixtures.carla);

    render(<LeaderboardPage />);

    const bar = await screen.findByRole("progressbar", {
      name: "Progresso até o líder do quadro: 50%",
    });
    expect(bar).toBeInTheDocument();
  });

  it("a líder vê o posicionamento de topo com o mesmo placar do mês (300 pontos = 100%)", async () => {
    beatingBoard(fixtures.bruno);

    render(<LeaderboardPage />);

    const personal = await screen.findByRole("region", { name: "Sua posição" });
    expect(within(personal).getByText("1º")).toBeInTheDocument();
    expect(within(personal).getByText("Você lidera o quadro.")).toBeInTheDocument();
    expect(
      await screen.findByRole("progressbar", { name: "Progresso até o líder do quadro: 100%" }),
    ).toBeInTheDocument();
  });

  it("a classificação completa segue a régua no empate: Elena (4º) e Diego (5º) esperam o topo", async () => {
    beatingBoard(fixtures.carla);

    render(<LeaderboardPage />);

    const heading = await screen.findByRole("heading", { name: "Classificação completa" });
    const section = heading.closest("section") as HTMLElement;
    const rows = within(section).getAllByRole("row");
    // A classificação completa só lista a partir do 4º (o pódio já está no campeão). O empate
    // em 150 não aparece aqui: Ana e Carla são pódio, decididos pelo nome na régua do fechado.
    expect(within(rows[1]).getByText("4º")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Elena Braga")).toBeInTheDocument();
    expect(within(rows[2]).getByText("5º")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Diego Serra")).toBeInTheDocument();
  });
});
