import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

const filters = vi.hoisted(() => ({
  projeto: null as number | null,
  atrasadas: false,
  hoje: false,
  busca: "",
  pessoa: null as number | null,
  atividade: null as number | null,
}))

vi.mock("nuqs", () => ({
  parseAsBoolean: { withDefault: () => ({}) },
  parseAsInteger: {},
  parseAsString: { withDefault: () => ({}) },
  useQueryState: (key: keyof typeof filters) => [filters[key], vi.fn()],
}))

import { HomeOverview } from "@/features/tasks/components/home-overview"

const projects = [
  { id: 1, name: "Projeto Alfa", createdAt: "2026-10-13T12:00:00.000Z", status: "active" },
  { id: 2, name: "Projeto Beta", createdAt: "2026-10-12T12:00:00.000Z", status: "active" },
]
const tasks = [
  { id: 1, title: "Planejar Alfa", status: "to-do", assignedTo: 7, assigneeIds: [7], projectId: 1, activityId: 11, dueDate: null },
  { id: 2, title: "Concluir Alfa", status: "done", assignedTo: 8, assigneeIds: [8], projectId: 1, activityId: 11, dueDate: null },
  { id: 3, title: "Concluir Beta", status: "done", assignedTo: 7, assigneeIds: [7], projectId: 2, activityId: 22, dueDate: null },
] as never

describe("HomeOverview filters", () => {
  beforeEach(() => {
    filters.projeto = null
    filters.atrasadas = false
    filters.hoje = false
    filters.busca = ""
    filters.pessoa = null
    filters.atividade = null
  })

  it("recalcula os gráficos e projetos recentes ao filtrar por pessoa", () => {
    filters.pessoa = 7
    render(<HomeOverview projects={projects} tasks={tasks} weekHours={20} currentWeekHours={5} />)

    expect(screen.getByRole("img", { name: "Distribuição das tarefas por status" })).toBeInTheDocument()
    expect(screen.getByText("50% das tarefas concluídas")).toBeInTheDocument()
    expect(screen.getByText("Meta da semana").parentElement).toHaveTextContent("5 / 20 h")
    expect(screen.getByRole("link", { name: /Projeto Alfa/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Projeto Beta/ })).toBeInTheDocument()
  })

  it("conta atrasadas pela mesma regra do filtro do quadro", () => {
    filters.pessoa = 7
    const atrasada = { id: 99, title: "Atrasada de verdade", status: "to-do", dueDate: "2026-10-01", projectId: 1, assignedTo: 7, assigneeIds: [7] }
    render(<HomeOverview projects={projects} tasks={[...tasks, atrasada] as never} weekHours={20} currentWeekHours={5} />)
    expect(screen.getByText("1 atrasada")).toBeInTheDocument()
    expect(screen.queryByText("2 atrasadas")).not.toBeInTheDocument()
  })

  it("combina projeto e pessoa no mesmo recorte", () => {
    filters.projeto = 1
    filters.pessoa = 7
    render(<HomeOverview projects={projects} tasks={tasks} weekHours={20} currentWeekHours={5} />)

    expect(screen.getByRole("img", { name: "Distribuição das tarefas por status" })).toBeInTheDocument()
    expect(screen.getByText("0% das tarefas concluídas")).toBeInTheDocument()
    expect(screen.getByText("A Fazer").parentElement).toHaveTextContent("1")
    expect(screen.getByRole("link", { name: /Projeto Alfa/ })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Projeto Beta/ })).not.toBeInTheDocument()
  })
})
