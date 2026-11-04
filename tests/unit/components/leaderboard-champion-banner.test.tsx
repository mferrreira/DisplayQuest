/**
 * plan-v14 S03 (regra 3) — a capa do campeão é o fundo translúcido do bloco inteiro, no mês
 * em curso e nos meses fechados, com o recorte da conta aplicado.
 *
 * Por que existe: o dono mediu "um recorte estreito na parte de cima" e a capa ausente nos
 * meses fechados. Medido no docker em 2026-11-04: o fundo cobre a seção inteira (w=1033, h=146
 * na seção de 1024×146) no mês em curso, e no mês fechado a capa aparece quando a conta de hoje
 * tem `bannerKey` (o caminho dos fechamentos lê a conta, que cascadeia). Este arquivo congela os
 * dois ramos com o zoom das colunas, sobre o harness de `leaderboard-month-history.test.tsx`.
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
    logoCropX: null,
    logoCropY: null,
    logoCropZoom: null,
    bannerKey: null,
    bannerCropX: null,
    bannerCropY: null,
    bannerCropZoom: null,
  },
  // Quadro vivo: Bruno lidera com a capa recortada (zoom 2), centro 0.3/0.3.
  live: [
    {
      id: 21,
      name: "Bruno Rocha",
      currentMonthPoints: 300,
      completedTasks: 6,
      points: 40,
      avatar: null,
      avatarKey: null,
      logoCropX: null,
      logoCropY: null,
      logoCropZoom: null,
      bannerKey: "users/21/images/banner/x.webp",
      bannerCropX: 0.3,
      bannerCropY: 0.3,
      bannerCropZoom: 2,
    },
    {
      id: 22,
      name: "Carla Lima",
      currentMonthPoints: 150,
      completedTasks: 4,
      points: 100,
      avatar: null,
      avatarKey: null,
      logoCropX: null,
      logoCropY: null,
      logoCropZoom: null,
      bannerKey: "users/22/images/banner/y.webp",
      bannerCropX: 0.5,
      bannerCropY: 0.5,
      bannerCropZoom: 1.5,
    },
    {
      id: 23,
      name: "Ana Prado",
      currentMonthPoints: 10,
      completedTasks: 9,
      points: 500,
      avatar: null,
      avatarKey: null,
      logoCropX: null,
      logoCropY: null,
      logoCropZoom: null,
      bannerKey: null,
      bannerCropX: null,
      bannerCropY: null,
      bannerCropZoom: null,
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
  return section.querySelector('[data-banner-crop="true"]')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("plan-v14 S03 — capa do campeão como fundo cheio, com o recorte da conta", () => {
  it("mês em curso: a capa cobre o bloco inteiro com o zoom gravado", () => {
    render(<LeaderboardPage />)

    const section = championSection()
    const piece = backgroundPiece(section)
    expect(piece).not.toBeNull()

    const img = piece!.querySelector("img")!
    expect(img.getAttribute("src")).toContain("/api/users/21/images/banner/file")
    expect(img.getAttribute("style")).toContain("scale(2)")
    expect(img.className).toContain("inset-0")
    // A peça preenche a moldura; a moldura do bloco é a faixa `absolute inset-0` do campeão.
    expect(piece!.className).toContain("h-full w-full")
    const frame = piece!.parentElement!
    expect(frame.className).toContain("absolute inset-0")
    expect(section.contains(frame)).toBe(true)
  })

  it("mês fechado: a capa da conta de hoje entra como fundo cheio com o zoom da conta", async () => {
    render(<LeaderboardPage />)

    // Abrir o seletor e escolher o janeiro fechado (lição do painel: `fireEvent` na opção).
    fireEvent.click(await screen.findByRole("combobox", { name: "Mês do quadro" }))
    const option = await screen.findByRole("option", { name: /janeiro de 2026/ })
    fireEvent.click(option)

    const section = await waitFor(() => championSection())
    const piece = backgroundPiece(section)
    expect(piece).not.toBeNull()

    const img = piece!.querySelector("img")!
    expect(img.getAttribute("src")).toContain("/api/users/22/images/banner/file")
    expect(img.getAttribute("style")).toContain("scale(1.5)")
    expect(img.className).toContain("inset-0")
    expect(piece!.className).toContain("h-full w-full")
    const frame = piece!.parentElement!
    expect(frame.className).toContain("absolute inset-0")
    expect(section.contains(frame)).toBe(true)
  })

  it("campeão do fechamento sem conta de hoje: bloco intacto, nenhum fundo inventado", async () => {
    // Lia lidera dezembro e não tem conta na lista de hoje — o bloco fica sem fundo.
    render(<LeaderboardPage />)

    fireEvent.click(await screen.findByRole("combobox", { name: "Mês do quadro" }))
    const option = await screen.findByRole("option", { name: /dezembro de 2025/ })
    fireEvent.click(option)

    await waitFor(() => screen.getByText("Lia Andrade"))
    const section = championSection()
    expect(backgroundPiece(section)).toBeNull()
    expect(screen.getByText("1º lugar")).toBeInTheDocument()
  })
})
