import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ProjectManagerDashboard } from "@/components/features/project-manager-dashboard"

const project = { id: 1, name: "Pesquisa", leaderId: 7, status: "active", createdAt: "2026-01-01", startDate: "2026-01-01", endDate: "2026-12-31", points: 40, description: "Projeto de exemplo" } as any
const secondProject = { id: 2, name: "Microscopia", leaderId: 8, status: "completed", createdAt: "2026-02-01", points: 70 } as any

// S04 (plan-v23, DEC-268): a seção "Projetos no recorte" saiu do painel por pedido do dono
// em 2026-11-11. O seletor da aba continua recortando o leaderboard — o que ele decide hoje
// é só a coleção que o `ProjectLeaderboard` recebe.
const championSection = () => screen.getByRole("region", { name: "Campeão dos projetos" })
const selector = () => screen.getByRole("combobox", { name: "Selecionar projeto para estatísticas" })

describe("ProjectManagerDashboard (aba só com leaderboard, DEC-268)", () => {
  it("não existe a seção 'Projetos no recorte' — o painel é só o leaderboard", () => {
    render(<ProjectManagerDashboard projects={[project, secondProject]} tasks={[]} users={[]} onProjectSelect={() => {}} />)
    expect(screen.queryByRole("region", { name: "Projetos no recorte" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { level: 3, name: "Pesquisa" })).not.toBeInTheDocument()
    expect(screen.getByText((_text, element) => element?.textContent === "Recorte: Todos os projetos")).toBeVisible()
    // Microscopia (70 pts) é a campeã do recorte inteiro.
    expect(championSection()).toHaveTextContent("Microscopia")
  })

  it("o seletor recorta só o leaderboard, e voltar a 'Todos os projetos' devolve a coleção", async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProjectManagerDashboard projects={[project, secondProject]} tasks={[]} users={[]} onProjectSelect={() => {}} />)

    await user.selectOptions(selector(), "1")
    expect(screen.getByText((_text, element) => element?.textContent === "Recorte: Projeto: Pesquisa")).toBeVisible()
    // Recorte de um projeto só: o campeão passa a ser o projeto do recorte, e o outro some do quadro.
    expect(championSection()).toHaveTextContent("Pesquisa")
    expect(championSection().textContent).not.toContain("Microscopia")

    fireEvent.change(selector(), { target: { value: "all" } })
    expect(championSection()).toHaveTextContent("Microscopia")
  })
})
