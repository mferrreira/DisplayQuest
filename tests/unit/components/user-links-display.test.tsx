/**
 * S09 (plan-v21, R15/DEC-264) — links no perfil com favicon do domínio.
 *
 * Por que existe: o dono adiciona linkedin e github na Configurações; o perfil mostra cada link
 * com o favicon derivado do domínio. A imagem falha e o glyph de link aparece no lugar. Nada de
 * favicon no banco: o endereço do serviço é derivado no render.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { UserProfileForm } from "@/components/forms/user-profile-form"
import { UserProfileView } from "@/components/ui/user-profile-view"
import { UserLinks } from "@/components/ui/user-links"
import type { User } from "@/contexts/types"

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  getProfile: vi.fn().mockResolvedValue({ user: { cpf: null } }),
  updateProfile: vi.fn().mockResolvedValue({ user: {} }),
  fetchAPI: vi.fn(),
}))

vi.mock("@/contexts/api-client", () => ({
  UserProfilesAPI: mocks,
  fetchAPI: mocks.fetchAPI,
}))

vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: mocks.updateSession }),
}))

const me = (links: { label: string; url: string }[] = []): User => ({
  id: 7,
  name: "Ana Souza",
  email: "ana@lab.com",
  roles: ["VOLUNTARIO"] as never,
  points: 0,
  completedTasks: 0,
  weekHours: 10,
  currentWeekHours: 0,
  status: "active",
  avatar: null,
  bio: null,
  profileVisibility: "public",
  createdAt: new Date(),
  links,
})

const third = (links: { label: string; url: string }[] = []): User => ({
  ...me(),
  id: 9,
  name: "Bruno",
  links,
})

function faviconFor(url: string) {
  return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`
}

beforeEach(() => {
  mocks.updateSession.mockReset()
  mocks.getProfile.mockResolvedValue({ user: { cpf: null } })
  mocks.updateProfile.mockReset()
  mocks.updateProfile.mockResolvedValue({ user: {} })
  mocks.fetchAPI.mockResolvedValue({
    months: [],
    notice: "Nenhum mês fechado ainda. A lista aparece depois do primeiro fechamento.",
    userId: 9,
    track: "MONTH_POINTS",
  })
})

describe("links de usuário na tela", () => {
  it("o dono adiciona linkedin e github, remove linha vazia, e salva a lista normalizada", async () => {
    const user = userEvent.setup({ delay: null })
    render(<UserProfileForm user={me()} onUpdate={vi.fn()} onCancel={vi.fn()} />)

    const add = screen.getByRole("button", { name: "Adicionar link" })
    await user.click(add)
    await user.type(screen.getByRole("textbox", { name: "Label do link 1" }), "LinkedIn")
    await user.type(screen.getByRole("textbox", { name: "URL do link 1" }), "linkedin.com/in/ana")

    await user.click(screen.getByRole("button", { name: "Adicionar link" }))
    await user.type(screen.getByRole("textbox", { name: "Label do link 2" }), "GitHub")
    await user.type(screen.getByRole("textbox", { name: "URL do link 2" }), "https://github.com/ana")

    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }))
    await vi.waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled())

    expect(mocks.updateProfile.mock.calls[0][1]).toEqual({
      links: [
        { label: "LinkedIn", url: "https://linkedin.com/in/ana" },
        { label: "GitHub", url: "https://github.com/ana" },
      ],
    })
  })

  it("o dono remove um link da lista e salva a lista menor", async () => {
    const user = userEvent.setup({ delay: null })
    render(<UserProfileForm user={me([{ label: "GitHub", url: "https://github.com/ana" }, { label: "Site", url: "https://lab.example" }])} onUpdate={vi.fn()} onCancel={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Remover link GitHub" }))
    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }))
    await vi.waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled())

    expect(mocks.updateProfile.mock.calls[0][1]).toEqual({
      links: [{ label: "Site", url: "https://lab.example" }],
    })
  })

  it("o perfil mostra cada link com favicon do domínio e url normalizada", () => {
    render(<UserProfileView onBack={() => undefined} user={third([
      { label: "LinkedIn", url: "https://linkedin.com/in/ana" },
      { label: "GitHub", url: "https://github.com/ana" },
    ])} />)

    const section = screen.getByRole("region", { name: "Links" })
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("href", "https://linkedin.com/in/ana")
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/ana")

    const images = section.querySelectorAll("img")
    expect(images[0]?.getAttribute("src")).toBe(faviconFor("https://linkedin.com/in/ana"))
    expect(images[1]?.getAttribute("src")).toBe(faviconFor("https://github.com/ana"))
    expect(images[0]?.getAttribute("alt")).toBe("")
  })

  it("favicon quebrado cai no glyph de link, sem esconder o link", () => {
    render(<UserLinks links={[{ label: "GitHub", url: "https://github.com/ana" }]} />)
    const img = screen.getByRole("link", { name: "GitHub" }).querySelector("img")
    expect(img).not.toBeNull()

    fireEvent.error(img as HTMLImageElement)

    const link = screen.getByRole("link", { name: "GitHub" })
    expect(link.querySelector("img")).toBeNull()
    expect(screen.getByTestId("link-fallback").getAttribute("aria-hidden")).toBe("true")
  })

  it("lista vazia não aparece no perfil de terceiro", () => {
    render(<UserProfileView onBack={() => undefined} user={third([])} />)
    expect(screen.queryByRole("region", { name: "Links" })).toBeNull()
  })
})
