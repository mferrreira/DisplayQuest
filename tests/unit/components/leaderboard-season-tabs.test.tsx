/**
 * plan-v20 S02 (DEC-255) — a aba Temporada no leaderboard.
 *
 * O que este arquivo trava, na tela medida:
 *  - a aba existe e se chama **Temporada**; as três abas são Projetos, Temporada, Pessoas, e
 *    Projetos continua por primeiro e aba padrão (DEC-249 intacta);
 *  - em curso, o pódio e a tabela são pelo SALDO (`users.points`), não pelo placar do mês: a
 *    pessoa com saldo maior lidera mesmo com placar de mês menor;
 *  - o seletor de ano declara o ano em curso e as temporadas fechadas vindas do servidor, e o
 *    rótulo dos anos vem do servidor (`seasonYear` / `closedSeasons`), nunca calculado no
 *    navegador (DEC-132);
 *  - abrir uma temporada fechada troca o pódio e a tabela para as linhas congeladas: o campeão
 *    passa a ser o do fechamento, com o valor da linha;
 *  - voltar ao ano em curso devolve o quadro vivo; falha de leitura diz `role="alert"` com
 *    retry, e temporada fechada sem linha é quadro vazio com aviso (CA8 espelhada).
 *
 * Padrão dos testes da página: contextos por `vi.mock`, `fetchAPI` dobrado. Radix Tabs seleciona
 * no `mousedown` (medido em 1.1.2); opções do Select chegam um frame depois no jsdom.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const fixtures = vi.hoisted(() => ({
  me: {
    id: 22,
    name: "Carla Lima",
    email: "carla@test.local",
    roles: ["VOLUNTARIO"],
    points: 500,
    completedTasks: 4,
    status: "active",
    weekHours: 20,
    currentWeekHours: 0,
    currentMonthPoints: 150,
  },
  // Quadro vivo: Bruno lidera o MÊS com 300; Carla lidera o SALDO com 500. A aba Temporada tem
  // que mostrar Carla no topo — o número da temporada é o saldo, não o placar.
  live: [
    { id: 21, name: "Bruno Rocha", points: 40, currentMonthPoints: 300, completedTasks: 6 },
    { id: 22, name: "Carla Lima", points: 500, currentMonthPoints: 150, completedTasks: 4 },
    { id: 23, name: "Ana Prado", points: 10, currentMonthPoints: 10, completedTasks: 9 },
    { id: 24, name: "Diego Serra", points: -20, currentMonthPoints: 5, completedTasks: 1 },
  ],
  metadata: {
    month: "2026-02",
    monthLabel: "fevereiro de 2026",
    track: "MONTH_POINTS",
    closed: false,
    live: false,
    closedMonths: [{ month: "2026-01", monthLabel: "janeiro de 2026" }],
    seasonYear: "2026",
    closedSeasons: [
      { year: "2025", yearLabel: "temporada 2025" },
      { year: "2024", yearLabel: "temporada 2024" },
    ],
  },
  // 2025 fechada: a ordem congelada é OUTRA — Bruno lidera o fechamento com 40, Carla em 3º.
  closedSeason2025: {
    year: "2025",
    yearLabel: "temporada 2025",
    track: "SEASON_POINTS",
    closed: true,
    live: false,
    closedAt: "2026-01-01T03:00:00.000Z",
    notice: "Temporada fechada: temporada 2025. Valor e posição congelados no fechamento.",
    entries: [
      { userId: 21, name: "Bruno Rocha", value: 40, position: 1 },
      { userId: 23, name: "Ana Prado", value: 12, position: 2 },
      { userId: 22, name: "Carla Lima", value: 7, position: 3 },
    ],
  },
  // 2024 fechada sem linha: CA8 espelhada na tela.
  closedSeason2024: {
    year: "2024",
    yearLabel: "temporada 2024",
    track: "SEASON_POINTS",
    closed: true,
    live: false,
    closedAt: "2025-01-01T03:00:00.000Z",
    notice: "A temporada temporada 2024 está vazia: nenhuma pessoa entrou no fechamento.",
    entries: [],
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: fixtures.me, loading: false, logout: vi.fn() }) }));
vi.mock("@/contexts/project-context", () => ({ useProject: () => ({ projects: [] as never[] }) }));
vi.mock("@/contexts/task-context", () => ({ useTask: () => ({ tasks: [] as never[] }) }));
vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({ users: fixtures.live as never, loading: false, error: null, fetchUsers: vi.fn(), updateUser: vi.fn(), addPointsToUser: vi.fn() }),
}));

const mode = vi.hoisted(() => ({ value: "ok" as "ok" | "fail" | "pending" }));

const fetchAPI = vi.hoisted(() =>
  vi.fn(async (url: string) => {
    const year = new URL(url, "http://localhost:3000").searchParams.get("year");
    if (year === "2025" || year === "2024") {
      if (mode.value === "fail") throw new Error("leitura recusou");
      if (mode.value === "pending") return new Promise(() => {});
      return year === "2025" ? fixtures.closedSeason2025 : fixtures.closedSeason2024;
    }
    return fixtures.metadata;
  }),
);
vi.mock("@/contexts/api-client", () => ({ fetchAPI, UsersAPI: {} }));

import LeaderboardPage from "@/app/(dashboard)/dashboard/leaderboard/page";

async function openSeasonSelector() {
  const trigger = await screen.findByRole("combobox", { name: "Ano da temporada" });
  fireEvent.click(trigger);
}

async function chooseSeason(label: string) {
  const option = await screen.findByRole("option", { name: new RegExp(label, "i") });
  fireEvent.click(option);
}

async function openSeasonTab() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Temporada" }));
  // A aba abre e o corpo da temporada chega: o cabeçalho da coluna nomeia a temporada.
  await screen.findByRole("columnheader", { name: "Pontos da temporada" });
}

describe("aba Temporada (plan-v20 S02, DEC-255)", () => {
  beforeEach(() => {
    mode.value = "ok";
  });

  it("as três abas, Projetos por primeiro, Temporada no meio, Pessoas por último", () => {
    render(<LeaderboardPage />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Projetos", "Temporada", "Pessoas"]);
    expect(screen.getByRole("tab", { name: "Projetos" })).toHaveAttribute("aria-selected", "true");
  });

  it("em curso, o pódio é pelo saldo: Carla lidera mesmo com placar de mês menor que Bruno", async () => {
    render(<LeaderboardPage />);
    await openSeasonTab();

    const champion = await screen.findByText("Carla Lima");
    const section = champion.closest("section") ?? champion;
    expect(within(section as HTMLElement).getByText("500")).toBeInTheDocument();
    // A ordem do pódio é a do saldo: Bruno (40) em 2º, Ana (10) em 3º, mesmo com o placar do mês
    // de Bruno sendo o maior do quadro de Pessoas. O quarto (Diego, -20) entra na tabela.
    const runners = screen.getByRole("region", { name: "Segundo e terceiro lugares" });
    expect(within(runners).getByText("Bruno Rocha")).toBeInTheDocument();
    expect(within(runners).getByText("Ana Prado")).toBeInTheDocument();
    const table = screen.getByRole("table");
    const names = within(table).getAllByRole("row").slice(1).map((r) => within(r).getByRole("link").textContent);
    expect(names[0]).toContain("Diego Serra");
  });

  it("o seletor de ano vem do servidor: ano em curso e temporada 2025, o ano não é calculado no navegador", async () => {
    render(<LeaderboardPage />);
    await openSeasonTab();

    await openSeasonSelector();
    // Nada de ano calculado no navegador: os anos oferecidos são exatamente os que vieram do
    // servidor (`seasonYear` + `closedSeasons`), com a sentinela da casa.
    const options = screen.getAllByRole("option").map((o) => o.textContent ?? "")
    const seasonOptions = options.filter((text) => /temporada/.test(text));
    expect(seasonOptions).toEqual(["temporada em curso", "temporada 2025", "temporada 2024"]);
  });

  it("abrir a temporada fechada troca o pódio para as linhas congeladas: Bruno lidera com o valor da linha", async () => {
    render(<LeaderboardPage />);
    await openSeasonTab();

    await openSeasonSelector();
    await chooseSeason("temporada 2025");

    const champion = await screen.findByText("Bruno Rocha");
    const section = champion.closest("section") ?? champion;
    expect(within(section as HTMLElement).getByText("40")).toBeInTheDocument();
    // A ordem do fechamento é a da posição gravada: Ana em 2º, Carla em 3º — não a ordem do
    // saldo de hoje, que colocaria Carla no pódio.
    const runners = screen.getByRole("region", { name: "Segundo e terceiro lugares" });
    expect(within(runners).getByText("Ana Prado")).toBeInTheDocument();
    expect(within(runners).getByText("Carla Lima")).toBeInTheDocument();
  });

  it("voltar ao ano em curso devolve o quadro vivo de antes", async () => {
    render(<LeaderboardPage />);
    await openSeasonTab();

    await openSeasonSelector();
    await chooseSeason("temporada 2025");
    await screen.findByText("Bruno Rocha");

    await openSeasonSelector();
    await chooseSeason("temporada em curso");

    const champion = await screen.findByText("Carla Lima");
    const section = champion.closest("section") ?? champion;
    expect(within(section as HTMLElement).getByText("500")).toBeInTheDocument();
  });

  it("temporada fechada sem linha é quadro vazio com aviso, não o quadro em curso (CA8 espelhada)", async () => {
    render(<LeaderboardPage />);
    await openSeasonTab();

    await openSeasonSelector();
    await chooseSeason("temporada 2024");

    const empty = await screen.findByText(/temporada 2024 está vazia/i);
    expect(empty).toBeInTheDocument();
    expect(screen.queryByText("Carla Lima")).toBeNull();
  });

  it("falha de leitura diz alert com retry, e o quadro em curso não aparece no lugar da temporada pedida", async () => {
    mode.value = "fail";
    render(<LeaderboardPage />);
    await openSeasonTab();

    await openSeasonSelector();
    await chooseSeason("temporada 2025");

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/temporada 2025/)).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();

    mode.value = "ok";
    fireEvent.click(within(alert).getByRole("button", { name: "Tentar de novo" }));
    await screen.findByText("Bruno Rocha");
  });

  it("pódio e tabela da aba Temporada não têm bloco de posição pessoal — a temporada é o saldo acumulado", async () => {
    render(<LeaderboardPage />);
    await openSeasonTab();
    expect(screen.queryByText("Sua posição")).toBeNull();
    expect(screen.queryByText(/Progresso até o líder/)).toBeNull();
  });

  it("a coluna de pontos da aba Temporada diz pontos da temporada", async () => {
    render(<LeaderboardPage />);
    await openSeasonTab();
    expect(screen.getByRole("columnheader", { name: "Pontos da temporada" })).toBeInTheDocument();
  });
});
