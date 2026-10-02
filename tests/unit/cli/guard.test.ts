import { describe, it, expect } from "vitest"
import { assertCliAllowed } from "../../../cli/guard"

// A10: CLI administrativo (cria admin, aprova usuário, reseta senha) só em
// desenvolvimento — fora disso, exige a flag explícita --allow-prod.

describe("cli/guard — assertCliAllowed", () => {
  it("bloqueia quando NODE_ENV=production sem --allow-prod", () => {
    expect(assertCliAllowed({ nodeEnv: "production" })).toBe(false)
  })

  it("permite quando NODE_ENV=production com --allow-prod", () => {
    expect(assertCliAllowed({ nodeEnv: "production", allowProd: true })).toBe(true)
  })

  it("permite quando NODE_ENV=development", () => {
    expect(assertCliAllowed({ nodeEnv: "development" })).toBe(true)
  })

  it("bloqueia quando NODE_ENV está ausente (fail-closed)", () => {
    expect(assertCliAllowed({})).toBe(false)
  })

  it("permite com allowProd independente do nodeEnv", () => {
    expect(assertCliAllowed({ nodeEnv: "production", allowProd: true })).toBe(true)
    expect(assertCliAllowed({ nodeEnv: "test", allowProd: true })).toBe(true)
  })
})