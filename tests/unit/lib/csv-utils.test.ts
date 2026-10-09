import { describe, it, expect } from "vitest"
import { csvCell } from "@/lib/reports/csv-utils"

describe("csvCell — sanitização contra injeção de fórmula (A8)", () => {
  it("neutraliza célula iniciada com '='", () => {
    expect(csvCell("=1+1")).toBe(`"'=1+1"`)
  })

  it("neutraliza célula iniciada com '+'", () => {
    expect(csvCell("+SUM(A1:A2)")).toBe(`"'+SUM(A1:A2)"`)
  })

  it("neutraliza célula iniciada com '-'", () => {
    expect(csvCell("-10")).toBe(`"'-10"`)
  })

  it("neutraliza célula iniciada com '@'", () => {
    expect(csvCell("@cmd")).toBe(`"'@cmd"`)
  })

  it("neutraliza célula iniciada com tab", () => {
    expect(csvCell("\tconteudo")).toBe(`"'\tconteudo"`)
  })

  it("neutraliza célula iniciada com CR", () => {
    expect(csvCell("\rconteudo")).toBe(`"'\rconteudo"`)
  })

  it("neutraliza mesmo com espaços antes do caractere de fórmula", () => {
    expect(csvCell("  =1+1")).toBe(`"  '=1+1"`)
  })

  it("dobra aspas internas sem prefixar", () => {
    expect(csvCell('a"b')).toBe(`"a""b"`)
  })

  it("mantém célula benigna inalterada", () => {
    expect(csvCell("texto simples")).toBe(`"texto simples"`)
  })

  it("mantém valor com espaço à frente (não é fórmula)", () => {
    expect(csvCell(" texto")).toBe(`" texto"`)
  })

  it("trata null como vazio", () => {
    expect(csvCell(null)).toBe(`""`)
  })
})