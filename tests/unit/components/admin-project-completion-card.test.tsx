/**
 * Fix 4 (2026-10-28): o cartão do projeto na aba Projetos do painel fica avermelhado quando o
 * projeto tem atividade com conclusão solicitada (`completionRequested`). Mesma paleta da tarefa
 * vencida. O flag vem da projeção da lista de projetos, não de coluna.
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { AdminProjectManagement } from "@/components/admin/AdminProjectManagement"

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Pesquisa em IA",
    description: "Projeto de exemplo",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    leaderId: 2,
    members: [],
    completionRequested: false,
    ...overrides,
  }
}

function renderPanel(projects: Record<string, unknown>[]) {
  render(<AdminProjectManagement projects={projects} users={[]} tasks={[]} sessions={[]} />)
}

describe("AdminProjectManagement — cartão avermelhado por conclusão solicitada (fix 4)", () => {
  it("cartão com completionRequested carrega a classe destrutiva e o selo", () => {
    renderPanel([project({ completionRequested: true })])

    const title = screen.getByText("Pesquisa em IA")
    const card = title.closest("[class*='border-destructive']")
    expect(card).not.toBeNull()
    expect(card!.className).toContain("border-destructive/50")
    expect(card!.className).toContain("bg-destructive/5")

    expect(screen.getByText("Conclusão solicitada")).toBeTruthy()
  })

  it("cartão sem solicitação não fica avermelhado nem mostra o selo", () => {
    renderPanel([project({ completionRequested: false })])

    const title = screen.getByText("Pesquisa em IA")
    const card = title.closest("[class*='border-destructive']")
    expect(card).toBeNull()
    expect(screen.queryByText("Conclusão solicitada")).toBeNull()
  })
})
