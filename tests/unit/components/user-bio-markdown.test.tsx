/**
 * S08 (plan-v21, R12/DEC-263) — a bio renderiza markdown no perfil de terceiro.
 *
 * Por que existe: a bio sai do texto cru para a MESMA peça de markdown da descrição do
 * projeto (`lib/markdown-render`). Os testes fixam: `**negrito**` vira `strong`, `![nome](url)`
 * vira `<img>` com a URL da rota autenticada, HTML cru continua escapado — e o perfil próprio
 * (page.tsx) usa a mesma peça. A biografia simples sem markdown segue legível.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { UserProfileView } from "@/components/ui/user-profile-view"
import type { User } from "@/contexts/types"

const mocks = vi.hoisted(() => ({ fetchAPI: vi.fn() }))

vi.mock("@/contexts/api-client", () => ({
  UserProfilesAPI: { getProfile: vi.fn(), updateProfile: vi.fn() },
  fetchAPI: mocks.fetchAPI,
}))

vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: vi.fn() }),
}))

const third = (bio: string): User => ({
  id: 9,
  name: "Bruno",
  email: "bruno@lab.com",
  roles: ["VOLUNTARIO"] as never,
  points: 12,
  completedTasks: 3,
  weekHours: 10,
  currentWeekHours: 0,
  status: "active",
  avatar: null,
  bio,
  profileVisibility: "public",
  createdAt: new Date(),
})

beforeEach(() => {
  mocks.fetchAPI.mockResolvedValue({
    months: [],
    notice: "Nenhum mês fechado ainda. A lista aparece depois do primeiro fechamento.",
    userId: 9,
    track: "MONTH_POINTS",
  })
})

describe("bio em markdown no perfil", () => {
  it("negrito e link saem pela peça única", () => {
    render(<UserProfileView onBack={() => undefined} user={third("**estudante** e [lab](https://lab.com)")} />)
    const bio = screen.getByTestId("bio-markdown")
    expect(bio.querySelector("strong")?.textContent).toBe("estudante")
    expect(bio.querySelector("a")?.getAttribute("href")).toBe("https://lab.com")
    expect(bio.querySelector("a")?.getAttribute("rel")).toContain("noopener")
  })

  it("imagem da bio vira <img> com a URL autenticada", () => {
    render(<UserProfileView onBack={() => undefined} user={third("![rosto](/api/users/9/markdown-images/abc.png?v=users/9/markdown-images/abc.png)")} />)
    const img = screen.getByTestId("bio-markdown").querySelector("img")
    expect(img?.getAttribute("src")).toBe("/api/users/9/markdown-images/abc.png?v=users/9/markdown-images/abc.png")
    expect(img?.getAttribute("alt")).toBe("rosto")
  })

  it("HTML cru continua escapado na bio", () => {
    render(<UserProfileView onBack={() => undefined} user={third("<script>alert(1)</script>")} />)
    const bio = screen.getByTestId("bio-markdown")
    expect(bio.textContent).toContain("<script>alert(1)</script>")
    expect(bio.querySelector("script")).toBeNull()
  })
})
