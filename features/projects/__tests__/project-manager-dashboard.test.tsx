import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ProjectManagerDashboard } from "@/components/features/project-manager-dashboard"

const project = { id: 1, name: "Pesquisa", leaderId: 7, status: "active", createdAt: "2026-01-01", startDate: "2026-01-01", endDate: "2026-12-31", description: "Projeto de exemplo" } as any
const secondProject = { id: 2, name: "Microscopia", leaderId: 8, status: "completed", createdAt: "2026-02-01" } as any

// plan-v13 S05: os gráficos da aba são sobre o cronograma (regra 4), e os gráficos de tasks
// da aba saíram. Este arquivo era a medida da aba de tasks; virou a medida da linha de
// atividades recortada pelo seletor de projeto.
const activities = [
  { id: 10, projectId: 1, order: 1, status: "OPEN", description: "Coleta", firstMonth: "2026-01", lastMonth: "2026-03" },
  { id: 11, projectId: 2, order: 1, status: "DONE", description: "Medição", firstMonth: "2026-02", lastMonth: "2026-04" },
] as const

describe("ProjectManagerDashboard", () => {
  it("recorta os gráficos de atividade pelo projeto selecionado", async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProjectManagerDashboard projects={[project, secondProject]} tasks={[]} activities={activities as any} onProjectSelect={() => {}} />)

    // Fechada por padrão: só o cabeçalho da linha; o seletor e "Andamento temporal" seguem.
    expect(screen.getByRole("button", { name: /mostrar/i })).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("img", { name: /Atividades do cronograma/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /mostrar/i }))
    expect(screen.getByRole("img", { name: /Todos os projetos\. Atividades do cronograma por status/ })).toBeVisible()
    expect(screen.getByText("Andamento temporal")).toBeVisible()

    await user.selectOptions(screen.getByRole("combobox", { name: "Selecionar projeto para estatísticas" }), "2")
    expect(screen.getByText("Projeto: Microscopia")).toBeVisible()
    expect(screen.getByRole("img", { name: /Projeto: Microscopia\. Atividades do cronograma por status/ })).toBeVisible()
  })
})
