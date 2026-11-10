// @vitest-environment node
/**
 * S09 (plan-v21, R14/DEC-264) — os links da pessoa chegam pela rota.
 *
 * Por que existe: a pessoa adiciona e remove os próprios links na aba Configurações; a gestão
 * também pode escrever pelo PUT do painel. A regra de normalização mora no domínio, e a rota
 * devolve a lista normalizada. O 11º link é recusado com a frase congelada, e o duplo de
 * repositório prova que nada foi gravado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { createUserManagementModule } from "@/backend/modules/user-management"

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  users: new Map<number, Record<string, unknown>>(),
}))

vi.mock("@/backend/composition/root", () => {
  const repository = {
    async findById(id: number) {
      return mocks.users.get(id) ?? null
    },
    async update(record: Record<string, unknown>) {
      const id = Number(record.id)
      const next = { ...(mocks.users.get(id) ?? {}), ...record }
      mocks.users.set(id, next)
      return next
    },
    findAll: async () => [],
    create: async () => {
      throw new Error("create não deveria rodar aqui")
    },
    delete: async () => {
      throw new Error("delete não deveria rodar aqui")
    },
  } as never

  return {
    getBackendComposition: () => ({
      userManagement: createUserManagementModule({
        repository,
        profileVisibility: { async isVisible() { return true } } as never,
      }),
    }),
  }
})

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}))

import { PATCH as PATCH_PROFILE } from "@/app/api/users/[id]/profile/route"
import { PUT as PUT_USER } from "@/app/api/users/[id]/route"

function login(roles: string[], id: number) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" }
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) }
}

function jsonRequest(method: string, path: string, body: unknown) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const baseUser = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  name: "Ana",
  email: "ana@lab.com",
  password: "h",
  status: "active",
  roles: ["VOLUNTARIO"],
  bio: null,
  weekHours: 10,
  currentWeekHours: 0,
  points: 0,
  completedTasks: 0,
  profileVisibility: "public",
  avatar: null,
  avatarKey: null,
  bannerKey: null,
  registrationNumber: null,
  course: null,
  scholarshipType: null,
  fundingAgency: null,
  fundingAgencyOther: null,
  level: null,
  links: [],
  ...overrides,
})

function links11() {
  return Array.from({ length: 11 }, (_, i) => ({
    label: `link ${i}`,
    url: `https://lab${i}.example`,
  }))
}

beforeEach(() => {
  mocks.session = null
  mocks.users = new Map<number, Record<string, unknown>>([
    [1, baseUser(1)],
    [2, baseUser(2, { roles: ["GERENTE"] })],
  ])
})

describe("links da pessoa nas rotas de escrita", () => {
  it("PATCH do dono adiciona linkedin e github, normaliza o protocolo, e remove a linha vazia", async () => {
    login(["VOLUNTARIO"], 1)
    const response = await PATCH_PROFILE(jsonRequest("PATCH", "/api/users/1/profile", {
      links: [
        { label: " LinkedIn ", url: "linkedin.com/in/ana" },
        { label: "", url: "" },
        { label: "GitHub", url: "https://github.com/ana" },
      ],
    }), context({ id: "1" }))

    expect(response.status).toBe(200)
    expect((await response.json()).user.links).toEqual([
      { label: "LinkedIn", url: "https://linkedin.com/in/ana" },
      { label: "GitHub", url: "https://github.com/ana" },
    ])
    expect(mocks.users.get(1)?.links).toEqual([
      { label: "LinkedIn", url: "https://linkedin.com/in/ana" },
      { label: "GitHub", url: "https://github.com/ana" },
    ])
  })

  it("PUT da gestão escreve a mesma regra", async () => {
    login(["GERENTE"], 2)
    const response = await PUT_USER(jsonRequest("PUT", "/api/users/1", {
      links: [{ label: "Currículo", url: "lab.example/ana" }],
    }), context({ id: "1" }))

    expect(response.status).toBe(200)
    expect((await response.json()).user.links).toEqual([
      { label: "Currículo", url: "https://lab.example/ana" },
    ])
    expect(mocks.users.get(1)?.links).toEqual([
      { label: "Currículo", url: "https://lab.example/ana" },
    ])
  })

  it("o 11º link é recusado, e nada é gravado", async () => {
    login(["VOLUNTARIO"], 1)
    const response = await PATCH_PROFILE(jsonRequest("PATCH", "/api/users/1/profile", { links: links11() }), context({ id: "1" }))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("Máximo de 10 links")
    expect(mocks.users.get(1)?.links).toEqual([])
  })

  it("url com protocolo fora de http/https é recusada, e nada é gravado", async () => {
    login(["VOLUNTARIO"], 1)
    const response = await PATCH_PROFILE(jsonRequest("PATCH", "/api/users/1/profile", {
      links: [{ label: "site", url: "javascript:alert(1)" }],
    }), context({ id: "1" }))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("URL inválida")
    expect(mocks.users.get(1)?.links).toEqual([])
  })

  it("null limpa os links", async () => {
    mocks.users.set(1, baseUser(1, { links: [{ label: "GitHub", url: "https://github.com/ana" }] }))
    login(["VOLUNTARIO"], 1)
    const response = await PATCH_PROFILE(jsonRequest("PATCH", "/api/users/1/profile", { links: null }), context({ id: "1" }))
    expect(response.status).toBe(200)
    expect(mocks.users.get(1)?.links).toEqual([])
  })
})
