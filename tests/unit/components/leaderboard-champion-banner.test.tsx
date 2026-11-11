/**
 * plan-v14 S03 (regra 3) — a capa do campeão é o fundo translúcido do bloco inteiro, no mês
 * em curso e nos meses fechados.
 *
 * Por que existe: o dono mediu "um recorte estreito na parte de cima" e a capa ausente nos
 * meses fechados. Medido no docker em 2026-11-04: o fundo cobre a seção inteira (w=1033, h=146
 * na seção de 1024×146) no mês em curso, e no mês fechado a capa aparece quando a conta de hoje
 * tem `bannerKey` (o caminho dos fechamentos lê a conta, que cascadeia). Este arquivo congela os
 * dois ramos sobre o harness de `leaderboard-month-history.test.tsx`. O recorte saiu por decisão
 * do dono (2026-11-05): o fundo é cover simples.
 *
 * Costura medida: o Select do Radix abre um frame depois no jsdom; a lista fecha com
 * `pointer-events:none` durante a animação, então a opção é clicada com `fireEvent`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

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
    avatarKey: null,
    bannerKey: null,
  },
  // Quadro vivo: Bruno lidera com a capa da conta.
  live: [
    {
      id: 21,
      name: "Bruno Rocha",
      currentMonthPoints: 300,
      completedTasks: 6,
      points: 40,
      avatar: null,
      avatarKey: null,
      bannerKey: "users/21/images/banner/x.webp",
    },
    {
      id: 22,
      name: "Carla Lima",
      currentMonthPoints: 150,
      completedTasks: 4,
      points: 100,
      avatar: null,
      avatarKey: null,
      bannerKey: "users/22/images/banner/y.webp",
    },
    {
      id: 23,
      name: "Ana Prado",
      currentMonthPoints: 10,
      completedTasks: 9,
      points: 500,
      avatar: null,
      avatarKey: null,
      bannerKey: null,
    },
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
  // Janeiro fechado: Carla (22) lidera o fechamento e TEM a capa da conta de hoje (zoom 1.5),
  // que o ramo fechado lê da conta quando ela existe.
  closedJanuary: {
    month: "2026-01",
    monthLabel: "janeiro de 2026",
    track: "MONTH_POINTS",
    closed: true,
    live: false,
    closedAt: "2026-02-01T03:00:00.000Z",
    notice: "Mês fechado: janeiro de 2026. Valor e posição congelados no fechamento.",
    entries: [
      { userId: 22, name: "Carla Lima", value: 210, position: 1 },
      { userId: 23, name: "Ana Prado", value: 120, position: 2 },
    ],
  },
  // Dezembro fechado: o campeão (31) não tem conta na lista de hoje — o bloco fica intacto.
  closedDecember: {
    month: "2025-12",
    monthLabel: "dezembro de 2025",
    track: "MONTH_POINTS",
    closed: true,
    live: false,
    closedAt: "2026-01-01T03:00:00.000Z",
    notice: "Mês fechado: dezembro de 2025. Valor e posição congelados no fechamento.",
    entries: [{ userId: 31, name: "Lia Andrade", value: 90, position: 1 }],
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: fixtures.me, loading: false, logout: vi.fn() }),
}))
// plan-v18 S03 (DEC-249): a página agora lê os contextos de projeto e tarefa para a aba
// Projetos. Os testes do ranking só usam a aba Pessoas; estes mocks servem a aba Projetos.
vi.mock("@/contexts/project-context", () => ({ useProject: () => ({ projects: [] as never[] }) }));
vi.mock("@/contexts/task-context", () => ({ useTask: () => ({ tasks: [] as never[] }) }));


vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({
    users: fixtures.live as never,
    loading: false,
    error: null,
    fetchUsers: vi.fn(),
    updateUser: vi.fn(),
    addPointsToUser: vi.fn(),
  }),
}))

vi.mock("@/contexts/api-client", () => ({
  fetchAPI: vi.fn(async (url: string) => {
    const month = new URL(url, "http://localhost:3000").searchParams.get("month")
    if (month === "2026-01") return fixtures.closedJanuary
    if (month === "2025-12") return fixtures.closedDecember
    return fixtures.metadata
  }),
  UsersAPI: {},
}))

import LeaderboardPage from "@/app/(dashboard)/dashboard/leaderboard/page"

function championSection() {
  return screen.getByRole("region", { name: "Campeão do quadro" })
}

function backgroundPiece(section: HTMLElement) {
  // O recorte saiu: o fundo é o `<img>` de cover simples com `alt=""` do bloco.
  return section.querySelector('img[alt=""]')
}

beforeEach(() => {
  vi.clearAllMocks()
})
// plan-v18 S03 (DEC-249, ADR-006) + plan-v23 S02 (DEC-265): a página tem três abas e Pessoas
// é a default. `renderPessoas` ativa a aba antes de assar o quadro — com a aba já ativa, o
// mouseDown é inofensivo e o `aria-selected` é lido na hora.
async function renderPessoas() {
  render(<LeaderboardPage />)
  const tab = screen.getByRole("tab", { name: "Pessoas" })
  fireEvent.mouseDown(tab)
  await waitFor(() => expect(tab).toHaveAttribute("aria-selected", "true"))
}


describe("plan-v14 S03 — capa do campeão como fundo cheio", () => {
  it("mês em curso: a capa cobre o bloco inteiro", async () => {
    await renderPessoas()

    const section = championSection()
    const img = backgroundPiece(section)
    expect(img).not.toBeNull()

    expect(img!.getAttribute("src")).toContain("/api/users/21/images/banner/file")
    // Cover simples: nenhum transform de recorte.
    expect(img!.getAttribute("style")).toBeNull()
    expect(img!.className).toContain("inset-0")
    // A opacidade mora na moldura `absolute inset-0`; o `<img>` da peça única a preenche.
    const frame = img!.parentElement!.parentElement!
    expect(frame.className).toContain("absolute inset-0 opacity-20")
    expect(section.contains(frame)).toBe(true)
  })

  it("mês fechado: a capa da conta de hoje entra como fundo cheio", async () => {
    await renderPessoas()

    // Abrir o seletor e escolher o janeiro fechado (lição do painel: `fireEvent` na opção).
    fireEvent.click(await screen.findByRole("combobox", { name: "Mês do quadro" }))
    const option = await screen.findByRole("option", { name: /janeiro de 2026/ })
    fireEvent.click(option)

    const section = await waitFor(() => championSection())
    const img = backgroundPiece(section)
    expect(img).not.toBeNull()

    expect(img!.getAttribute("src")).toContain("/api/users/22/images/banner/file")
    expect(img!.getAttribute("style")).toBeNull()
    expect(img!.className).toContain("inset-0")
    expect(section.contains(img!)).toBe(true)
  })

  it("campeão do fechamento sem conta de hoje: bloco intacto, nenhum fundo inventado", async () => {
    // Lia lidera dezembro e não tem conta na lista de hoje — o bloco fica sem fundo.
    await renderPessoas()

    fireEvent.click(await screen.findByRole("combobox", { name: "Mês do quadro" }))
    const option = await screen.findByRole("option", { name: /dezembro de 2025/ })
    fireEvent.click(option)

    await waitFor(() => screen.getByText("Lia Andrade"))
    const section = championSection()
    expect(backgroundPiece(section)).toBeNull()
    expect(screen.getByText("1º lugar")).toBeInTheDocument()
  })
})
