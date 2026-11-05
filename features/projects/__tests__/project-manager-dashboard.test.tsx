import { describe, expect, it } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ProjectManagerDashboard } from "@/components/features/project-manager-dashboard"

const project = { id: 1, name: "Pesquisa", leaderId: 7, status: "active", createdAt: "2026-01-01", startDate: "2026-01-01", endDate: "2026-12-31", points: 40, description: "Projeto de exemplo" } as any
const secondProject = { id: 2, name: "Microscopia", leaderId: 8, status: "completed", createdAt: "2026-02-01", points: 70 } as any

// Os cards de gráficos da linha S05 saíram por decisão do dono em 2026-11-05 — a aba é só
// leaderboard. Este arquivo é a medida do seletor: ele recorta o leaderboard e a seção
// "Projetos no recorte" para um projeto só. Os nomes aparecem nos dois blocos, então cada
// asserção escopa o bloco pelo rótulo acessível.
const recorteSection = () => screen.getByRole("region", { name: "Projetos no recorte" })

describe("ProjectManagerDashboard", () => {
  it("o seletor de projeto recorta o leaderboard e a seção do recorte", async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProjectManagerDashboard projects={[project, secondProject]} tasks={[]} onProjectSelect={() => {}} />)

    expect(screen.getByText((_text, element) => element?.textContent === "Recorte: Todos os projetos")).toBeVisible()
    // Microscopia (70 pts) é a campeã; Pesquisa aparece só no recorte.
    expect(screen.getByRole("region", { name: "Campeão dos projetos" })).toHaveTextContent("Microscopia")
    expect(within(recorteSection()).getByRole("heading", { level: 3, name: "Pesquisa" })).toBeVisible()
    expect(within(recorteSection()).getByRole("heading", { level: 3, name: "Microscopia" })).toBeVisible()

    await user.selectOptions(screen.getByRole("combobox", { name: "Selecionar projeto para estatísticas" }), "2")
    expect(screen.getByText((_text, element) => element?.textContent === "Recorte: Projeto: Microscopia")).toBeVisible()
    expect(within(recorteSection()).getByRole("heading", { level: 3, name: "Microscopia" })).toBeVisible()
    expect(within(recorteSection()).queryByRole("heading", { level: 3, name: "Pesquisa" })).not.toBeInTheDocument()
  })

  it("voltar para 'Todos os projetos' devolve os projetos ao recorte", async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProjectManagerDashboard projects={[project, secondProject]} tasks={[]} onProjectSelect={() => {}} />)

    await user.selectOptions(screen.getByRole("combobox", { name: "Selecionar projeto para estatísticas" }), "1")
    expect(screen.getByText((_text, element) => element?.textContent === "Recorte: Projeto: Pesquisa")).toBeVisible()

    fireEvent.change(screen.getByRole("combobox", { name: "Selecionar projeto para estatísticas" }), { target: { value: "all" } })
    expect(within(recorteSection()).getByRole("heading", { level: 3, name: "Pesquisa" })).toBeVisible()
    expect(within(recorteSection()).getByRole("heading", { level: 3, name: "Microscopia" })).toBeVisible()
  })
})
