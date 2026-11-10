// @vitest-environment node
/**
 * S08 (plan-v21, R12/DEC-263) — o teto da bio.
 *
 * A bio passa a carregar markdown, e o texto longo demais é recusa de domínio, não de tela:
 * os dois caminhos de escrita (PATCH do perfil, PUT do painel) respondem 400 com a frase
 * congelada e nada é gravado. O módulo é REAL sobre um duplo de repositório; as rotas são as
 * de produção.
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
      const current = mocks.users.get(id) ?? {}
      const next = { ...current, ...record }
      mocks.users.set(id, next)
      return next
    },
    // As demais portas não são exercitadas por estes casos.
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

const LONG = "x".repeat(2001)

beforeEach(() => {
  mocks.session = null
  mocks.users = new Map<number, Record<string, unknown>>([
    [1, { id: 1, name: "Ana", email: "ana@lab.com", password: "h", status: "active", roles: ["VOLUNTARIO"], bio: "bio curta", weekHours: 10, currentWeekHours: 0, points: 0, completedTasks: 0, profileVisibility: "public", avatar: null }],
    [2, { id: 2, name: "Beto", email: "beto@lab.com", password: "h", status: "active", roles: ["GERENTE"], bio: null, weekHours: 10, currentWeekHours: 0, points: 0, completedTasks: 0, profileVisibility: "public", avatar: null }],
  ])
})

describe("teto da bio (2000 caracteres)", () => {
  it("PATCH do perfil recusa bio acima do teto com a frase congelada, e nada é gravado", async () => {
    login(["VOLUNTARIO"], 1)
    const response = await PATCH_PROFILE(jsonRequest("PATCH", "/api/users/1/profile", { bio: LONG }), context({ id: "1" }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("Bio não pode ter mais de 2000 caracteres")
    expect(mocks.users.get(1)?.bio).toBe("bio curta")
  })

  it("PUT do painel (MANAGE_USERS) recusa o mesmo teto", async () => {
    login(["GERENTE"], 2)
    const response = await PUT_USER(jsonRequest("PUT", "/api/users/1", { bio: LONG }), context({ id: "1" }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("Bio não pode ter mais de 2000 caracteres")
    expect(mocks.users.get(1)?.bio).toBe("bio curta")
  })

  it("bio de 2000 caracteres passa, e null limpa a linha", async () => {
    login(["VOLUNTARIO"], 1)
    const ok = await PATCH_PROFILE(jsonRequest("PATCH", "/api/users/1/profile", { bio: "x".repeat(2000) }), context({ id: "1" }))
    expect(ok.status).toBe(200)
    expect(String(mocks.users.get(1)?.bio).length).toBe(2000)
    const cleared = await PATCH_PROFILE(jsonRequest("PATCH", "/api/users/1/profile", { bio: null }), context({ id: "1" }))
    expect(cleared.status).toBe(200)
    expect(mocks.users.get(1)?.bio).toBeNull()
  })

  it("terceiro sem gestão é recusado no PATCH do perfil", async () => {
    login(["VOLUNTARIO"], 3)
    mocks.users.set(3, { id: 3, name: "Cintia", email: "cintia@lab.com", password: "h", status: "active", roles: ["VOLUNTARIO"], bio: null, weekHours: 10, currentWeekHours: 0, points: 0, completedTasks: 0, profileVisibility: "public", avatar: null })
    login(["VOLUNTARIO"], 3)
    const response = await PATCH_PROFILE(jsonRequest("PATCH", "/api/users/1/profile", { bio: "tentativa" }), context({ id: "1" }))
    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe("Não autorizado")
    expect(mocks.users.get(1)?.bio).toBe("bio curta")
  })
})
