/**
 * S09 (plan-v21, R14/DEC-264) — as regras puras dos links da pessoa.
 *
 * Por que existe: `users.links` é JSONB `[{label,url}]`, e o servidor precisa normalizar antes
 * de gravar. A regra decide o formato: sem protocolo entra `https://`, só http/https passam,
 * label tem teto 50, e o 11º link é recusado.
 */
import { describe, expect, it } from "vitest"

import {
  USER_LINK_LIMIT,
  USER_LINK_LABEL_MAX,
  USER_LINK_LIMIT_MESSAGE,
  USER_LINK_LABEL_MESSAGE,
  USER_LINK_URL_MESSAGE,
  normalizeUserLinks,
} from "@/backend/domain/identity/user-links-rules"

describe("normalizeUserLinks", () => {
  it("ausente e null viram lista vazia", () => {
    expect(normalizeUserLinks(null)).toEqual([])
    expect(normalizeUserLinks(undefined)).toEqual([])
    expect(normalizeUserLinks([])).toEqual([])
  })

  it("sem protocolo entra https, e a label é aparada", () => {
    expect(normalizeUserLinks([
      { label: " LinkedIn ", url: "linkedin.com/in/ana" },
      { label: "GitHub", url: "https://github.com/ana" },
    ])).toEqual([
      { label: "LinkedIn", url: "https://linkedin.com/in/ana" },
      { label: "GitHub", url: "https://github.com/ana" },
    ])
  })

  it("linha vazia é removida, sem deixar fantasma", () => {
    expect(normalizeUserLinks([
      { label: "", url: "" },
      { label: "Site", url: "https://lab.example" },
    ])).toEqual([{ label: "Site", url: "https://lab.example" }])
  })

  it("label acima do teto é recusada com a frase congelada", () => {
    expect(() => normalizeUserLinks([{ label: "x".repeat(USER_LINK_LABEL_MAX + 1), url: "https://lab.example" }]))
      .toThrow(USER_LINK_LABEL_MESSAGE)
  })

  it("11 links são recusados com a frase congelada", () => {
    const links = Array.from({ length: USER_LINK_LIMIT + 1 }, (_, i) => ({
      label: `link ${i}`,
      url: `https://lab${i}.example`,
    }))
    expect(() => normalizeUserLinks(links)).toThrow(USER_LINK_LIMIT_MESSAGE)
  })

  it("protocolo fora de http/https é recusado com a frase congelada", () => {
    expect(() => normalizeUserLinks([{ label: "x", url: "ftp://lab.example" }])).toThrow(USER_LINK_URL_MESSAGE)
    expect(() => normalizeUserLinks([{ label: "x", url: "javascript:alert(1)" }])).toThrow(USER_LINK_URL_MESSAGE)
  })

  it("o teto da label conta após aparar", () => {
    expect(normalizeUserLinks([{ label: " x".repeat(25), url: "https://lab.example" }])).toHaveLength(1)
    expect(() => normalizeUserLinks([{ label: " x".repeat(26), url: "https://lab.example" }]))
      .toThrow(USER_LINK_LABEL_MESSAGE)
  })
})
