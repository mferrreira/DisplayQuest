import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * MEDIDO em 2026-10-23 (V8-8): `npm run db:test:setup` rodava sem seminar o estado atual do seed.
 * `prisma/seed.ts` chamava `createRequire(...)("./seed.dev")`, sem extensão, e a resolução escolhia
 * o artefato compilado e commitado `prisma/seed.dev.js` — um retrato de um seed antigo, que roda o
 * próprio `main()` com os dados de outro tempo. O sintoma: o script diz "Seed completa finalizada"
 * e a base continua no estado que os roundtrips deixaram.
 *
 * A fechadura é o nome. A forma sem extensão não é proibida pelo `tsc` nem por teste de seed: só o
 * sistema de arquivos decide, e decide errado quando existe um artefato velho no caminho.
 *
 * A dívida continua registrada: `prisma/seed.dev.js` existe e está versionado. Removê-lo é decisão
 * do dono; enquanto ele existir, a única coisa que separa a seed verdadeira do retrato é a extensão
 * escrita aqui.
 */

const seedEntry = readFileSync(resolve(process.cwd(), "prisma/seed.ts"), "utf-8")

describe("resolução do seed.dev (V8-8)", () => {
  it("prisma/seed.ts nomeia o arquivo com extensão", () => {
    expect(seedEntry).toContain('requireSeedDev("./seed.dev.ts")')
  })

  it("a forma sem extensão não volta: ela resolve o artefato compilado", () => {
    expect(seedEntry).not.toMatch(/requireSeedDev\(["']\.\/seed\.dev["']\)/)
  })

  it("o artefato que causa a sombra continua existindo, e isso é dívida registrada", () => {
    const sombra = resolve(process.cwd(), "prisma/seed.dev.js")
    let existe = true
    try {
      readFileSync(sombra, "utf-8")
    } catch {
      existe = false
    }
    expect(existe).toBe(true)
  })
})
