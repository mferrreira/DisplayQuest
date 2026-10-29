/**
 * plan-v9 S04 (MODELO §7, DEC-232) — o perfil fala do mês.
 *
 * O contrato que este arquivo fecha:
 *  - "Placar do mês" é um Fato do próprio perfil, com o valor da lista que a tela já carrega
 *    (`currentMonthPoints`); "Pontos" continua sendo o saldo, com o hint de acumulado;
 *  - "Posição" é a posição do MÊS na mesma régua do quadro (valor desc, depois nome, depois id):
 *    quem tem saldo maior não pisa para a frente;
 *  - "Histórico de meses" (seção "Meses fechados") lista os meses da pessoa desc, com
 *    rótulo humano, posição e valor — vazio tem EmptyState com o aviso do servidor;
 *  - o MESMO componente serve ao perfil de outra pessoa (UserProfileView): a lista aparece para o
 *    terceiro no que é o histórico do próprio perfil.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const fixtures = vi.hoisted(() => ({
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
  // A SESSÃO não carrega currentMonthPoints (lib/auth/config.ts copia points/completedTasks/
  // weekHours/currentWeekHours): a ausência aqui é o que pina a fonte do Fato — o valor tem de
  // sair da lista de usuários, não da sessão (ui-reviewer B1).
  carlaSession: {
    id: 22,
    name: "Carla Lima",
    email: "carla@test.local",
    roles: ["VOLUNTARIO"],
    points: 10,
    completedTasks: 4,
    status: "active",
    weekHours: 20,
    currentWeekHours: 0,
  },
  board: [] as Array<Record<string, unknown>>,
  months: {
    userId: 22,
    track: "MONTH_POINTS",
    months: [
      // O mais recente vem primeiro: a ordem é contrato do use case (R9 fecha por mês desc).
      { month: "2026-09", monthLabel: "setembro de 2026", value: 40, position: 2 },
      { month: "2026-08", monthLabel: "agosto de 2026", value: 5, position: 4 },
    ],
    notice: "",
  },
  emptyMonths: {
    userId: 22,
    track: "MONTH_POINTS",
    months: [],
    notice: "Nenhum mês fechado ainda. A lista aparece depois do primeiro fechamento.",
  },
}));

vi.mock("next/navigation", () => {
  return {
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => "/dashboard/profile",
  };
});

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: fixtures.carlaSession, loading: false, logout: vi.fn() }),
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

vi.mock("@/contexts/project-context", () => ({
  useProject: () => ({ projects: [], loading: false }),
}));

vi.mock("@/hooks/use-daily-logs", () => ({
  useDailyLogs: () => ({ logs: [] }),
}));

vi.mock("@/hooks/use-work-sessions", () => ({
  useWorkSessions: () => ({ sessions: [], getWeeklyHours: vi.fn(async () => 0), fetchSessions: vi.fn() }),
}));

const fetchAPI = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/api-client", () => ({
  fetchAPI,
  BadgesAPI: { getUserBadges: vi.fn(async () => ({ badges: [] })) },
  UsersAPI: {},
}));

import ProfilePage from "@/app/(dashboard)/dashboard/profile/page";
import { UserProfileView } from "@/components/ui/user-profile-view";

function mockMonths(read: Record<string, unknown>) {
  fetchAPI.mockImplementation(async (url: string) => {
    if (typeof url === "string" && url.includes("/board-months")) return read;
    if (typeof url === "string" && url.startsWith("/api/board")) {
      return { month: "2026-10", monthLabel: "outubro de 2026", track: "MONTH_POINTS" };
    }
    throw new Error(`fetchAPI não esperou por ${url}`);
  });
}

describe("S04 — perfil próprio fala do mês", () => {
  beforeEach(() => {
    fetchAPI.mockReset();
    fixtures.board = [fixtures.carla, fixtures.diego, fixtures.elena, fixtures.ana, fixtures.bruno];
    mockMonths(fixtures.months);
  });

  it("os Fatos mostram o placar do mês junto do saldo, e a Posição é a do mês na régua do quadro", async () => {
    render(<ProfilePage />);

    const facts = await screen.findByLabelText("Resumo do perfil");
    // Saldo (10) e placar do mês (150) são números diferentes na tela: as trilhas separadas
    // aparecem lado a lado (MODELO R1). O valor 150 sai da LISTA de usuários — a sessão não
    // carrega o campo (fixture carlaSession) —, e a asserção do valor é a que pina a fonte.
    expect(within(facts).getByText("Placar do mês")).toBeInTheDocument();
    expect(within(facts).getByText("150")).toBeInTheDocument();
    expect(within(facts).getByText("zera na virada")).toBeInTheDocument();
    expect(within(facts).getByText("Pontos")).toBeInTheDocument();
    expect(within(facts).getByText("acumulados")).toBeInTheDocument();

    // Régua do mês: Bruno 300 (1º), o empate 150 dá Ana 2º pelo nome e Carla 3º. Pelo saldo
    // (régua antiga) Carla seria 4º — o teste pega a troca de régua, não o número repetido.
    const positionFact = within(facts).getByText("Posição").closest("div") as HTMLElement;
    expect(within(positionFact).getByText("3º")).toBeInTheDocument();
    expect(within(positionFact).getByText("do mês, de 5 pessoas")).toBeInTheDocument();
  });

  it("Meses fechados lista o histórico do mais recente ao mais antigo com posição e valor", async () => {
    render(<ProfilePage />);

    const list = await screen.findByLabelText("Histórico de meses");
    expect(within(list).getByText("setembro de 2026")).toBeInTheDocument();
    expect(within(list).getByText("agosto de 2026")).toBeInTheDocument();
    expect(within(list).getByText("2º")).toBeInTheDocument();
    expect(within(list).getByText("4º")).toBeInTheDocument();
    // O valor fevado negativo é regra (R10); positivos aqui para não repetir o caso da S02.
    expect(within(list).getByLabelText("setembro de 2026: 40 pontos na posição 2")).toBeInTheDocument();
    expect(within(list).getByLabelText("agosto de 2026: 5 pontos na posição 4")).toBeInTheDocument();
  });

  it("nenhum mês fechado é estado vazio com o aviso do servidor, não silêncio", async () => {
    mockMonths(fixtures.emptyMonths);

    render(<ProfilePage />);

    expect(await screen.findByText("Nenhum mês fechado")).toBeInTheDocument();
    expect(
      await screen.findByText("Nenhum mês fechado ainda. A lista aparece depois do primeiro fechamento."),
    ).toBeInTheDocument();
  });

  it("falha de rede é estado nomeado (Meses indisponíveis), não lista em silêncio", async () => {
    fetchAPI.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/board-months")) {
        throw new Error("rede fora");
      }
      if (typeof url === "string" && url.startsWith("/api/board")) {
        return { month: "2026-10", monthLabel: "outubro de 2026", track: "MONTH_POINTS" };
      }
      throw new Error(`fetchAPI não esperou por ${url}`);
    });

    render(<ProfilePage />);

    expect(await screen.findByText("Meses indisponíveis")).toBeInTheDocument();
    expect(
      await screen.findByText("Não foi possível ler os meses fechados. Tente de novo mais tarde."),
    ).toBeInTheDocument();
  });
});

describe("S04 — perfil de outra pessoa mostra os meses fechados (DEC-232)", () => {
  beforeEach(() => {
    fetchAPI.mockReset();
    mockMonths(fixtures.months);
  });

  it("a lista aparece no perfil de terceiro com a mesma plasticidade do próprio", async () => {
    render(
      <UserProfileView user={fixtures.carla as never} onBack={vi.fn()} canEdit={false} projectNames={[]} />,
    );

    const list = await screen.findByLabelText("Histórico de meses");
    expect(within(list).getByText("setembro de 2026")).toBeInTheDocument();
    expect(within(list).getByText("2º")).toBeInTheDocument();
    // O Fato novo também está no perfil de terceiro.
    expect(within(screen.getByLabelText("Resumo do usuário")).getByText("Placar do mês")).toBeInTheDocument();
  });
});
