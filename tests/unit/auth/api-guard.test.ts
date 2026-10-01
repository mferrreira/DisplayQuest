import { describe, it, expect, vi, beforeEach } from "vitest"

const getServerSessionMock = vi.hoisted(() => vi.fn())

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}))

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    users: { findUnique: vi.fn() },
  },
}))

import { requireAuth, requireActiveUser } from "@/lib/auth/server-auth"
import { requireApiActor } from "@/lib/auth/api-guard"

function sessionUser(status?: string | null) {
  return {
    id: 42,
    name: "Ator",
    email: "ator@lab.com",
    roles: ["COLABORADOR"],
    status: status ?? undefined,
  }
}

beforeEach(() => {
  getServerSessionMock.mockReset()
})

describe("requireAuth — contas não-ativas (A3)", () => {
  it("bloqueia com 401 quando não há sessão", async () => {
    getServerSessionMock.mockResolvedValue(null)

    const result = await requireAuth()

    expect(result.error).toBeInstanceOf(Response)
    expect(result.error!.status).toBe(401)
  })

  it("segue quando o usuário está ativo", async () => {
    getServerSessionMock.mockResolvedValue({ user: sessionUser("active") })

    const result = await requireAuth()

    expect(result.error).toBeUndefined()
    expect(result.user).toMatchObject({ id: 42, status: "active" })
  })

  it.each(["suspended", "rejected", "pending"])(
    "bloqueia com 403 quando o status é %s",
    async (status) => {
      getServerSessionMock.mockResolvedValue({ user: sessionUser(status) })

      const result = await requireAuth()

      expect(result.error).toBeInstanceOf(Response)
      expect(result.error!.status).toBe(403)
      const body = await result.error!.json()
      expect(body.error).toBe("Usuário não está ativo")
    },
  )

  it("segue quando o status está ausente (sessão legada)", async () => {
    getServerSessionMock.mockResolvedValue({ user: sessionUser(null) })

    const result = await requireAuth()

    expect(result.error).toBeUndefined()
    expect(result.user).toMatchObject({ id: 42 })
  })
})

describe("requireApiActor — herda o gate de status (A3)", () => {
  it("bloqueia 403 para usuário suspenso mesmo válido como valor", async () => {
    getServerSessionMock.mockResolvedValue({ user: sessionUser("suspended") })

    const result = await requireApiActor()

    expect(result.error).toBeInstanceOf(Response)
    expect(result.error!.status).toBe(403)
  })

  it("retorna actor para usuário ativo", async () => {
    getServerSessionMock.mockResolvedValue({ user: sessionUser("active") })

    const result = await requireApiActor()

    expect("actor" in result).toBe(true)
    if ("actor" in result) {
      expect(result.actor).toMatchObject({ id: 42, roles: ["COLABORADOR"], status: "active" })
    }
  })
})

describe("requireActiveUser — equivale a requireAuth após o gate (A3)", () => {
  it("bloqueia 403 para usuário suspenso", async () => {
    getServerSessionMock.mockResolvedValue({ user: sessionUser("suspended") })

    const result = await requireActiveUser()

    expect(result.error).toBeInstanceOf(Response)
    expect(result.error!.status).toBe(403)
  })

  it("segue com usuário ativo", async () => {
    getServerSessionMock.mockResolvedValue({ user: sessionUser("active") })

    const result = await requireActiveUser()

    expect(result.error).toBeUndefined()
    expect(result.user).toMatchObject({ id: 42 })
  })
})