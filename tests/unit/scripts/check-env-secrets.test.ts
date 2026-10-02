import { describe, it, expect } from "vitest"
import { checkEnvSecrets } from "../../../scripts/check-env-secrets-lib"

// A5: secrets de infra não podem morar no código. Função pura (scripts/
// check-env-secrets-lib.js) valida NEXTAUTH_SECRET e senha do banco sem I/O.

const saudavel = {
  NEXTAUTH_SECRET: "x".repeat(40),
  POSTGRES_PASSWORD: "s3nh4-D1f3rente!2026",
}

const placeholdersSecret = ["your-secret-key-here", "<openssl rand -base64 32>"]

const secretCases: Array<[string, Record<string, string>]> = [
  ["ausente (sem a chave)", {}],
  ["vazia", { NEXTAUTH_SECRET: "" }],
  ["só espaços", { NEXTAUTH_SECRET: "   " }],
  ...placeholdersSecret.map(
    (p) => [`placeholder "${p}"`, { NEXTAUTH_SECRET: p }] as [string, Record<string, string>],
  ),
]

const denylistBanco = ["display-quest123", "postgres", "password", "123456"]

describe("check-env-secrets-lib — NEXTAUTH_SECRET", () => {
  it.each(secretCases)("falha quando %s fora de dev", (_caso: string, env) => {
    const result = checkEnvSecrets(env)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes("NEXTAUTH_SECRET"))).toBe(true)
  })

  it("falha quando o secret é curto demais (< 32 chars)", () => {
    const result = checkEnvSecrets({ NEXTAUTH_SECRET: "curto" })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes("NEXTAUTH_SECRET"))).toBe(true)
  })
})

describe("check-env-secrets-lib — senha do banco (denylist)", () => {
  it.each(denylistBanco)("falha quando POSTGRES_PASSWORD é %j fora de dev", (senha) => {
    const result = checkEnvSecrets({ ...saudavel, POSTGRES_PASSWORD: senha })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes("POSTGRES_PASSWORD"))).toBe(true)
  })

  it("falha quando POSTGRES_PASSWORD está ausente", () => {
    const result = checkEnvSecrets({ NEXTAUTH_SECRET: saudavel.NEXTAUTH_SECRET })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes("POSTGRES_PASSWORD"))).toBe(true)
  })
})

describe("check-env-secrets-lib — env saudável", () => {
  it("aprova secret 32+ chars e senha fora da denylist", () => {
    const result = checkEnvSecrets(saudavel)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })
})

describe("check-env-secrets-lib — modo development", () => {
  it("rebaixa as violações para warning (não erro)", () => {
    const result = checkEnvSecrets({
      NODE_ENV: "development",
      NEXTAUTH_SECRET: "",
      POSTGRES_PASSWORD: "display-quest123",
    })
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})