import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ProjectManagerDashboard } from "@/components/features/project-manager-dashboard"

const project = { id: 1, name: "Pesquisa", leaderId: 7, status: "active", createdAt: "2026-01-01", startDate: "2026-01-01", endDate: "2026-12-31", description: "Projeto de exemplo" } as any
const secondProject = { id: 2, name: "Microscopia", leaderId: 8, status: "completed", createdAt: "2026-02-01" } as any

describe("ProjectManagerDashboard", () => {
  it("filters task charts and weekly history when a project is selected", async () => {
    const user = userEvent.setup()
    render(<ProjectManagerDashboard projects={[project, secondProject]} tasks={[
      { id: 1, projectId: 1, status: "done", completedAt: "2026-10-12T12:00:00Z", dueDate: null },
      { id: 2, projectId: 2, status: "to-do", completedAt: null, dueDate: null },
    ] as any} onProjectSelect={() => {}} />)
    expect(screen.getByRole("img", { name: /Todos os projetos\. Distribuição das tarefas/ })).toBeVisible()
    expect(screen.getByRole("img", { name: /Todos os projetos\. Histórico semanal/ })).toBeVisible()
    expect(screen.getByText("Andamento temporal")).toBeVisible()

    await user.selectOptions(screen.getByRole("combobox", { name: "Selecionar projeto para estatísticas" }), "2")
    expect(screen.getByText("Projeto: Microscopia")).toBeVisible()
    expect(screen.getByRole("img", { name: /Projeto: Microscopia\. Distribuição das tarefas/ })).toBeVisible()
    expect(screen.getByRole("img", { name: /Projeto: Microscopia\. Histórico semanal/ })).toBeVisible()
  })
})
