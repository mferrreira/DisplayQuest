/**
 * plan-v9 S03 (MODELO §7, CA4, CA8) — o seletor de mês do Quadro de Liderança.
 *
 * O que este arquivo trava, na tela medida:
 *  - existe um seletor de mês, e o mês que ele mostra vem do servidor (a tela não calcula mês:
 *    DEC-132);
 *  - escolher um mês fechado troca o quadro inteiro para as linhas congeladas: o campeão passa a
 *    ser o do fechamento, não o do placar vivo, e o bloco pessoal some, porque mês fechado não tem
 *    progresso contra o líder de hoje (§7);
 *  - escolher um mês fechado sem linhas mostra o aviso de quadro vazio, e não o quadro do mês em
 *    curso (CA8);
 *  - voltar ao mês em curso devolve o quadro vivo de antes.
 *
 * Os contextos são dobrados, como em `leaderboard-month.test.tsx` (S01). O Select é clicado com
 * `fireEvent`: a lista de opções do Radix chega um frame depois no jsdom e fica com
 * `pointer-events: none` durante a animação (lição medida no painel admin).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const fixtures = vi.hoisted(() => ({
  me: {
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
  // Quadro vivo: Bruno lidera fevereiro com 300.
  live: [
    { id: 21, name: "Bruno Rocha", currentMonthPoints: 300, completedTasks: 6, points: 40 },
    { id: 22, name: "Carla Lima", currentMonthPoints: 150, completedTasks: 4, points: 100 },
    { id: 23, name: "Ana Prado", currentMonthPoints: 10, completedTasks: 9, points: 500 },
    { id: 24, name: "Diego Serra", currentMonthPoints: 5, completedTasks: 1, points: 999 },
    { id: 25, name: "Elena Braga", currentMonthPoints: 1, completedTasks: 0, points: 0 },
    { id: 26, name: "Zé Neto", currentMonthPoints: -20, completedTasks: 2, points: 10 },
  ],
  metadata: {
    month: "2026-02",
    monthLabel: "fevereiro de 2026",
    track: "MONTH_POINTS",
    closed: false,
    live: false,
    closedMonths: [
      { month: "2026-01", monthLabel: "janeiro de 2026" },
      { month: "2025-12", monthLabel: "dezembro de 2025" },
    ],
  },
  // Janeiro fechado: a ordem congelada é OUTRA. Lia lidera com 210, Bruno está em 4º.
  closedJanuary: {
    month: "2026-01",
    monthLabel: "janeiro de 2026",
    track: "MONTH_POINTS",
    closed: true,
    live: false,
    closedAt: "2026-02-01T03:00:00.000Z",
    notice: "Mês fechado: janeiro de 2026. Valor e posição congelados no fechamento.",
    entries: [
      { userId: 31, name: "Lia Andrade", value: 210, position: 1 },
      { userId: 22, name: "Carla Lima", value: 120, position: 2 },
      { userId: 23, name: "Ana Prado", value: 60, position: 3 },
      { userId: 21, name: "Bruno Rocha", value: 30, position: 4 },
      { userId: 32, name: "Rui Telles", value: -5, position: 5 },
    ],
  },
  // Dezembro fechado sem linha: CA8 na tela.
  closedDecember: {
    month: "2025-12",
    monthLabel: "dezembro de 2025",
    track: "MONTH_POINTS",
    closed: true,
    live: false,
    closedAt: "2026-01-01T03:00:00.000Z",
    notice: "O quadro de dezembro de 2025 está vazio: nenhuma pessoa entrou no fechamento.",
    entries: [],
  },
  // R9 na tela: o servidor devolve o mês corrente quando ele é pedido por nome. O quadro é o vivo,
  // e a tela não tem como saber mês — quem decide é o servidor.
  namedCurrentMonth: {
    month: "2026-02",
    monthLabel: "fevereiro de 2026",
    track: "MONTH_POINTS",
    closed: false,
    live: true,
    closedAt: null,
    notice: "Placar de fevereiro de 2026 em curso. O quadro ainda está aberto.",
    entries: [],
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: fixtures.me, loading: false, logout: vi.fn() }),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({
    // `as never` porque o teste não monta a lista inteira de campos de pessoa: o quadro lê id,
    // nome, placar do mês, tarefas, avatar e capa.
    users: fixtures.live as never,
    loading: false,
    error: null,
    fetchUsers: vi.fn(),
    updateUser: vi.fn(),
    addPointsToUser: vi.fn(),
  }),
}));

const mode = vi.hoisted(() => ({ value: "ok" as "ok" | "fail" | "pending" }));

const fetchAPI = vi.hoisted(() =>
  vi.fn(async (url: string) => {
    const month = new URL(url, "http://localhost:3000").searchParams.get("month");
    if (month === "2026-01" || month === "2025-12") {
      if (mode.value === "fail") throw new Error("leitura recusou");
      // Leitura que nunca chega: e o unico modo de fotografar o estado pendente da tela.
      if (mode.value === "pending") return new Promise(() => {});
      return month === "2026-01" ? fixtures.closedJanuary : fixtures.closedDecember;
    }
    if (month === "2026-02") return fixtures.namedCurrentMonth; // R9: mes corrente pedido por nome
    return fixtures.metadata;
  }),
);
vi.mock("@/contexts/api-client", () => ({ fetchAPI, UsersAPI: {} }));

import LeaderboardPage from "@/app/(dashboard)/dashboard/leaderboard/page";

async function openMonthSelector() {
  const trigger = await screen.findByRole("combobox", { name: "Mês do quadro" });
  fireEvent.click(trigger);
  return trigger;
}

async function chooseMonth(label: string) {
  const option = await screen.findByRole("option", { name: new RegExp(label, "i") });
  fireEvent.click(option);
}

/**
 * Espera a leitura do mês fechado chegar. É o ponto de sincronização: sem ele, o campeão lido pode
 * ser o do mês vivo, apresentado como se fosse o do fechamento (CA4).
 */
async function waitNotice(pattern: RegExp) {
  return await screen.findByText(pattern);
}

async function championRegion() {
  return await screen.findByRole("region", { name: "Campeão do quadro" });
}

describe("S03 — o quadro nomeia o mês e oferece os meses fechados", () => {
  beforeEach(() => {
    fetchAPI.mockClear();
    mode.value = "ok";
  });

  it("existe um seletor de mês, e a opção escolhida é o mês em curso", async () => {
    render(<LeaderboardPage />);
    const trigger = await openMonthSelector();
    // O rótulo do mês em curso mora no cabeçalho da tela; o seletor nomeia a opção, não o mês.
    expect(trigger).toHaveTextContent(/mês em curso/);
    expect(await screen.findByText(/fevereiro de 2026/)).toBeInTheDocument();
    expect(fetchAPI).toHaveBeenCalledWith("/api/board");
  });

  it("o seletor lista os meses que já fecharam", async () => {
    render(<LeaderboardPage />);
    await openMonthSelector();
    expect(await screen.findByRole("option", { name: /janeiro de 2026/ })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: /dezembro de 2025/ })).toBeInTheDocument();
  });

  it("o quadro vivo é o de fevereiro: Bruno lidera", async () => {
    render(<LeaderboardPage />);
    const champion = await championRegion();
    expect(within(champion).getByText("Bruno Rocha")).toBeInTheDocument();
  });
});

describe("S03 — CA4: mês fechado mostra valor e posição congelados", () => {
  beforeEach(() => {
    fetchAPI.mockClear();
    mode.value = "ok";
  });

  it("escolher janeiro troca o campeão para o do fechamento", async () => {
    render(<LeaderboardPage />);
    await championRegion();
    await openMonthSelector();
    await chooseMonth("janeiro de 2026");
    await waitNotice(/Mês fechado: janeiro de 2026/);

    const champion = await championRegion();
    expect(within(champion).getByText("Lia Andrade")).toBeInTheDocument();
    expect(within(champion).queryByText("Bruno Rocha")).not.toBeInTheDocument();
    expect(within(champion).getByText("210")).toBeInTheDocument();
    expect(fetchAPI).toHaveBeenCalledWith("/api/board?month=2026-01");
  });

  it("a tabela do mês fechado usa a posição congelada, começando no 4º", async () => {
    render(<LeaderboardPage />);
    await openMonthSelector();
    await chooseMonth("janeiro de 2026");
    await waitNotice(/Mês fechado: janeiro de 2026/);

    const heading = await screen.findByRole("heading", { name: "Classificação completa" });
    const section = heading.closest("section") as HTMLElement;
    // A coluna de tarefas não é só código: no fechado o rótulo diz o que a linha guarda hoje (INV3).
    expect(within(section).getByText("Tarefas cumulativas")).toBeInTheDocument();
    // Fechado com linhas também é região viva: trocar de mês precisa ser anunciado, como no
    // pendente e no quadro vazio.
    expect(section.closest('[role="status"]')).not.toBeNull();
    const rows = within(section).getAllByRole("row");
    expect(within(rows[1]).getByText("4º")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Bruno Rocha")).toBeInTheDocument();
    // O placar vivo de Bruno (300) nao aparece: o que a linha guarda e 30.
    expect(within(rows[1]).getByText("30")).toBeInTheDocument();
    expect(within(rows[1]).queryByText("300")).not.toBeInTheDocument();
  });

  it("mês fechado diz que está fechado e some com o bloco pessoal", async () => {
    render(<LeaderboardPage />);
    await openMonthSelector();
    await chooseMonth("janeiro de 2026");
    await waitNotice(/Mês fechado: janeiro de 2026/);

    expect(screen.queryByRole("region", { name: "Sua posição" })).not.toBeInTheDocument();
  });

  it("voltar ao mês em curso devolve o quadro vivo", async () => {
    render(<LeaderboardPage />);
    await openMonthSelector();
    await chooseMonth("janeiro de 2026");
    await waitNotice(/Mês fechado: janeiro de 2026/);

    await openMonthSelector();
    await chooseMonth("mês em curso");

    expect(await screen.findByRole("region", { name: "Sua posição" })).toBeInTheDocument();
    const champion = await championRegion();
    expect(within(champion).getByText("Bruno Rocha")).toBeInTheDocument();
  });
});

describe("S03 — CA8: mês fechado sem linha é quadro vazio com aviso", () => {
  beforeEach(() => {
    fetchAPI.mockClear();
    mode.value = "ok";
  });

  it("dezembro de 2025 mostra o aviso do mês vazio, e não o quadro de fevereiro", async () => {
    render(<LeaderboardPage />);
    await openMonthSelector();
    await chooseMonth("dezembro de 2025");

    // `getAllByText` com contagem: a mesma frase em dois lugares seria duplicação no DOM, e
    // `findByText` viraria strict mode violation. Um aviso por tela é o contrato (S01).
    expect(await screen.findAllByText(/dezembro de 2025 está vazio/)).toHaveLength(1);
    expect(await screen.findAllByText(/Fechamento de dezembro de 2025/)).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Campeão do quadro" })).not.toBeInTheDocument();
    expect(screen.queryByText("Bruno Rocha")).not.toBeInTheDocument();
    expect(screen.queryByText("Lia Andrade")).not.toBeInTheDocument();
  });
});

describe("S03 — CA4/CA8: a tela nunca cai no quadro vivo quando a leitura do mês fecha", () => {
  beforeEach(() => {
    fetchAPI.mockClear();
    mode.value = "ok";
  });

  it("leitura recusada do mês fechado devolve aviso de quadro indisponível, não o quadro de fevereiro", async () => {
    mode.value = "fail";
    render(<LeaderboardPage />);
    await openMonthSelector();
    await chooseMonth("janeiro de 2026");

    expect(await screen.findAllByText(/Não foi possível ler o quadro de janeiro de 2026/)).toHaveLength(1);
    // O bloco pessoal e do mes em curso. Dele nao pode sobrar nada enquanto o mes nomeado nao foi lido:
    // posicao, progresso e a frase de distancia ao lider vem todos do quadro de hoje.
    expect(screen.queryByRole("region", { name: "Sua posição" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Campeão do quadro" })).not.toBeInTheDocument();
  });

  it("a falha entrega o controle que promete: Tentar de novo re-lee o mês, sem tocar no quadro vivo", async () => {
    mode.value = "fail";
    render(<LeaderboardPage />);
    await openMonthSelector();
    await chooseMonth("janeiro de 2026");

    const retry = await screen.findByRole("button", { name: "Tentar de novo" });
    const readsBefore = fetchAPI.mock.calls.filter(([url]) => String(url).includes("month=2026-01")).length;

    fireEvent.click(retry);

    // `waitFor` aqui e a contagem: a segunda leitura sai do efeito disparado pelo retry.
    await waitFor(() =>
      expect(fetchAPI.mock.calls.filter(([url]) => String(url).includes("month=2026-01")).length).toBe(
        readsBefore + 1,
      ),
    );
    expect(screen.queryByRole("region", { name: "Campeão do quadro" })).not.toBeInTheDocument();
  });

  it("os três estados da leitura têm papel vivo: quem usa leitor de tela ouve a troca de mês", async () => {
    mode.value = "pending";
    render(<LeaderboardPage />);
    await openMonthSelector();
    await chooseMonth("janeiro de 2026");

    // Estado pendente: o texto existe dentro de uma regiao `role="status"`.
    const pending = await screen.findByText(/Lendo o quadro fechado de janeiro de 2026/);
    expect(pending.closest('[role="status"]')).not.toBeNull();

    mode.value = "fail";
    fireEvent.click(await screen.findByRole("combobox", { name: "Mês do quadro" }));
    await chooseMonth("dezembro de 2025");

    // Estado de falha: `role="alert"`, nao texto solto no corpo da pagina.
    const failed = await screen.findByText(/Não foi possível ler o quadro de dezembro de 2025/);
    expect(failed.closest('[role="alert"]')).not.toBeNull();
  });

  it("CA8: mês fechado sem linha declara o quadro vazio numa região viva", async () => {
    render(<LeaderboardPage />);
    await openMonthSelector();
    await chooseMonth("dezembro de 2025");

    const empty = await screen.findByText(/dezembro de 2025 está vazio/);
    expect(empty.closest('[role="status"]')).not.toBeNull();
  });

  it("pendente: o cabeçalho nomeia o mês que está sendo lido, não o mês em curso", async () => {
    mode.value = "pending";
    render(<LeaderboardPage />);
    await openMonthSelector();
    await chooseMonth("janeiro de 2026");

    // Sem este ramo o cabecalho diria "Placar de fevereiro de 2026" enquanto o quadro le janeiro —
    // a mesma mentira da CA4 com o sinal trocado.
    expect(await screen.findAllByText(/Lendo o fechamento de janeiro de 2026/)).toHaveLength(1);
    expect(screen.queryByText(/Placar de fevereiro de 2026/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Campeão do quadro" })).not.toBeInTheDocument();
  });

  it("R9: o contrato do mês corrente pedido por nome responde pelo placar vivo", async () => {
    render(<LeaderboardPage />);
    await championRegion();

    // O servidor devolve `live: true` para `?month=<mes corrente>`, com aviso proprio: quem pede o
    // mes em curso nunca recebe "quadro vazio" (CA8). A tela so pede mes fechado no seletor.
    // O cast e a forma do contrato lido: o duplo do `fetchAPI` nao tem genericos.
    const namedCurrent = (await fetchAPI("/api/board?month=2026-02")) as { live: boolean; closed: boolean };
    expect(namedCurrent.live).toBe(true);
    expect(namedCurrent.closed).toBe(false);

    expect(await screen.findByRole("region", { name: "Sua posição" })).toBeInTheDocument();
  });
});
