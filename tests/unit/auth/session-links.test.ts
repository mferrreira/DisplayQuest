/**
 * S09 (plan-v21, R15/DEC-264) — a sessão carrega os links da pessoa.
 *
 * Por que existe: o perfil próprio lê `useAuth()`, e a sessão já traz os campos abertos do
 * perfil. Se `links` ficar fora do select, o dono salva linkedin/github e a tela continua
 * sem a lista, mesmo com o banco gravado.
 */
import { describe, expect, it, vi } from "vitest"

const findUnique = vi.hoisted(() => vi.fn())

vi.mock("@/lib/database/prisma", () => ({
  prisma: { users: { findUnique } },
}))

import { authOptions } from "@/lib/auth/config"

describe("sessão de usuário", () => {
  it("a sessão inclui os links normalizados da pessoa", async () => {
    findUnique.mockResolvedValue({
      id: 7,
      name: "Ana",
      email: "ana@lab.com",
      links: [{ label: "LinkedIn", url: "https://linkedin.com/in/ana" }],
    })

    const session = await authOptions.callbacks!.session!({
      session: { user: { id: 7, email: "ana@lab.com", name: "Ana" } },
      token: { id: 7 },
    } as never)

    expect((session.user as any).links).toEqual([{ label: "LinkedIn", url: "https://linkedin.com/in/ana" }])
    expect(findUnique.mock.calls[0][0].select).toHaveProperty("links")
  })
})
