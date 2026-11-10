/**
 * S08 (plan-v21, R12/DEC-263) — o dono edita a bio com preview no Configurações.
 *
 * Por que existe: a bio sai da textarea crua do formulário para o MESMO dialog de markdown do
 * projeto (peça única, R10/R12). Os testes fixam: o botão "Editar biografia" abre o dialog com
 * a bio atual, a preview renderiza `**negrito**` pela mesma peça da tela, Salvar manda só
 * `{ bio }` para `UserProfilesAPI.updateProfile` (a rota decide self OU MANAGE_USERS), e o drop
 * de imagem insere `![nome](url)` com a URL da rota autenticada.
 *
 * Costura: os mesmos duplos do arquivo de dados de pessoa (UserProfilesAPI + useSession).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { UserProfileForm } from "@/components/forms/user-profile-form"
import type { User } from "@/contexts/types"

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  getProfile: vi.fn().mockResolvedValue({ user: { cpf: null } }),
  updateProfile: vi.fn().mockResolvedValue({ user: {} }),
  fetchAPI: vi.fn(),
  posts: [] as Array<{ path: string; form: FormData }>,
  fetchGlobal: null as unknown,
}))

vi.mock("@/contexts/api-client", () => ({
  UserProfilesAPI: {
    getProfile: mocks.getProfile,
    updateProfile: mocks.updateProfile,
  },
  fetchAPI: mocks.fetchAPI,
}))

vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: mocks.updateSession }),
}))

const me = (overrides: Partial<User> = {}): User => ({
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
  bio: "**analista do lab**",
  profileVisibility: "public",
  createdAt: new Date(),
  ...overrides,
})

function stubFetch() {
  mocks.posts = []
  mocks.fetchGlobal = vi.fn(async (input: unknown, init: RequestInit = {}) => {
    const path = new URL(String(input), "http://localhost:3000").pathname
    if ((init.method ?? "GET").toUpperCase() === "POST" && path.endsWith("/markdown-images")) {
      const key = "users/7/markdown-images/11111111-2222-3333-4444-555555555555.png"
      mocks.posts.push({ path, form: init.body as FormData })
      return new Response(JSON.stringify({ key, url: `/api/users/7/markdown-images/11111111-2222-3333-4444-555555555555.png?v=${key}`, name: "rosto.png" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    return new Response(JSON.stringify({ user: {} }), { status: 200, headers: { "content-type": "application/json" } })
  })
  vi.stubGlobal("fetch", mocks.fetchGlobal)
}

beforeEach(() => {
  mocks.updateSession.mockReset()
  mocks.updateProfile.mockReset()
  mocks.updateProfile.mockResolvedValue({ user: {} })
  stubFetch()
})

describe("dialog de bio no Configurações", () => {
  it("o botão abre o dialog com a bio atual e a preview renderizada", async () => {
    const user = userEvent.setup({ delay: null })
    render(<UserProfileForm user={me()} onUpdate={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Editar biografia" }))
    const textarea = await screen.findByRole("textbox", { name: "Biografia em markdown" })
    expect(textarea).toHaveValue("**analista do lab**")
    const preview = screen.getByTestId("preview-de-bio")
    expect(preview.querySelector("strong")?.textContent).toBe("analista do lab")
  })

  it("Salvar manda só { bio } para a API e devolve a bio atualizada", async () => {
    const onUpdate = vi.fn()
    const user = userEvent.setup({ delay: null })
    render(<UserProfileForm user={me()} onUpdate={onUpdate} onCancel={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Editar biografia" }))
    const textarea = await screen.findByRole("textbox", { name: "Biografia em markdown" })
    await user.type(textarea, "\n- membro ATIVO")
    await user.click(screen.getByRole("button", { name: "Salvar biografia" }))
    await waitForCall(() => mocks.updateProfile.mock.calls.length > 0)
    expect(mocks.updateProfile.mock.calls[0][1]).toEqual({ bio: "**analista do lab**\n- membro ATIVO" })
    expect(onUpdate).toHaveBeenCalled()
    expect(mocks.updateSession).toHaveBeenCalled()
  })

  it("Cancelar não escreve nada", async () => {
    const user = userEvent.setup({ delay: null })
    render(<UserProfileForm user={me()} onUpdate={vi.fn()} onCancel={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Editar biografia" }))
    const textarea = await screen.findByRole("textbox", { name: "Biografia em markdown" })
    await user.type(textarea, "texto não salvo")
    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(mocks.updateProfile).not.toHaveBeenCalled()
  })

  it("o drop de PNG insere ![nome](url) com a URL da rota autenticada", async () => {
    render(<UserProfileForm user={me()} onUpdate={vi.fn()} onCancel={vi.fn()} />)
    const user = userEvent.setup({ delay: null })
    await user.click(screen.getByRole("button", { name: "Editar biografia" }))
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Biografia em markdown" })
    fireEvent.drop(textarea, { dataTransfer: { files: [new File([new Uint8Array(8)], "rosto.png", { type: "image/png" })] } })
    await waitForCall(() => textarea.value.includes("![rosto.png]"))
    expect(textarea.value).toContain("![rosto.png](/api/users/7/markdown-images/11111111-2222-3333-4444-555555555555.png?v=users/7/markdown-images/11111111-2222-3333-4444-555555555555.png)")
    expect(mocks.posts).toHaveLength(1)
  })
})

async function waitForCall(predicate: () => boolean) {
  for (let i = 0; i < 50 && !predicate(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  if (!predicate()) throw new Error("a chamada esperada nunca chegou")
}
