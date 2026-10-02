import { describe, it, expect, vi, afterEach } from "vitest"
import { assertSeedAllowed } from "@/prisma/guard"

// A6: `prisma db seed`/`npm run db:seed` executa seed.dev — que zera o banco e cria
// usuários com senha padrão "123". A função de guarda deve abortar fora de dev.

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("assertSeedAllowed — seed só fora de desenvolvimento (A6)", () => {
  it("NODE_ENV=development → permitido", () => {
    expect(() => assertSeedAllowed("development")).not.toThrow()
  })

  it("NODE_ENV=production → lança", () => {
    expect(() => assertSeedAllowed("production")).toThrow(/NODE_ENV=development/)
  })

  it("NODE_ENV ausente → lança", () => {
    expect(() => assertSeedAllowed(undefined)).toThrow(/NODE_ENV=development/)
  })

  it("default usa process.env.NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(() => assertSeedAllowed()).toThrow(/NODE_ENV=development/)
  })
})