/**
 * S09 (plan-v21, R15/DEC-264) — o perfil próprio mostra a lista salva pelo dono.
 *
 * Por que existe: a pessoa adiciona linkedin e github na Configurações, salva, e o perfil
 * precisa mostrar os links com favicon do domínio. O perfil de terceiro já consome UserLinks;
 * este harness prende o caminho do dono, onde a lista vive em leitura.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import ProfilePage from "@/app/(dashboard)/dashboard/profile/page"

const authUser = vi.hoisted(() => ({
  id: 7,
  name: "Ana Souza",
  email: "ana@lab.com",
  roles: ["VOLUNTARIO"],
  points: 0,
  completedTasks: 0,
  weekHours: 10,
  currentWeekHours: 0,
  currentMonthPoints: 0,
  status: "active",
  avatar: null,
  bio: null,
  profileVisibility: "public",
  links: [{ label: "LinkedIn", url: "https://linkedin.com/in/ana" }, { label: "GitHub", url: "https://github.com/ana" }],
}))

const getUserBadges = vi.hoisted(() => vi.fn().mockResolvedValue({ badges: [] }))
const fetchAPI = vi.hoisted(() => vi.fn().mockResolvedValue({
  userId: 7,
  track: "MONTH_POINTS",
  months: [],
  notice: "Nenhum mês fechado ainda. A lista aparece depois do primeiro fechamento.",
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/profile",
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: authUser, loading: false, logout: vi.fn() }),
}))

vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({
    users: [authUser],
    loading: false,
    error: null,
    fetchUsers: vi.fn(),
    updateUser: vi.fn(),
    addPointsToUser: vi.fn(),
  }),
}))

vi.mock("@/contexts/project-context", () => ({
  useProject: () => ({ projects: [], loading: false }),
}))

vi.mock("@/hooks/use-daily-logs", () => ({
  useDailyLogs: () => ({ logs: [] }),
}))

vi.mock("@/hooks/use-work-sessions", () => ({
  useWorkSessions: () => ({
    sessions: [],
    currentSession: null,
    getElapsedSeconds: vi.fn(() => 0),
    getWeeklyHours: vi.fn(async () => 0),
    fetchSessions: vi.fn(),
  }),
}))

vi.mock("@/contexts/api-client", () => ({
  fetchAPI,
  BadgesAPI: { getUserBadges },
  UserProfilesAPI: {},
}))

describe("perfil próprio de usuário com links", () => {
  it("a leitura da Configurações mostra os links salvos com favicon do domínio", async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProfilePage />)

    await user.click(screen.getByRole("tab", { name: "Configurações" }))
    const links = await screen.findByRole("region", { name: "Links" })

    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("href", "https://linkedin.com/in/ana")
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/ana")

    const images = links.querySelectorAll("img")
    expect(images[0]?.getAttribute("src")).toBe("https://icons.duckduckgo.com/ip3/linkedin.com.ico")
    expect(images[1]?.getAttribute("src")).toBe("https://icons.duckduckgo.com/ip3/github.com.ico")
  })
})
