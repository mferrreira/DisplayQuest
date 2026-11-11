import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ProjetosPage from "@/app/(dashboard)/dashboard/projetos/page"

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 99, name: "Coord", roles: ["COORDENADOR"] } as any },
  projects: [] as any[],
  tasks: [] as any[],
  users: [] as any[],
  push: vi.fn(),
  fetchAPI: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: mocks.auth.user }) }))
vi.mock("@/contexts/project-context", () => ({ useProject: () => ({ projects: mocks.projects }) }))
vi.mock("@/contexts/task-context", () => ({ useTask: () => ({ tasks: mocks.tasks }) }))
vi.mock("@/contexts/user-context", () => ({ useUser: () => ({ users: mocks.users }) }))
vi.mock("@/contexts/api-client", () => ({ fetchAPI: mocks.fetchAPI }))
vi.mock("@/components/features/project-list", () => ({ ProjectList: ({ projects, tasks }: any) => <div data-testid="project-list" data-projects={projects.map((p: any) => p.name).join(",")} data-tasks={tasks.map((t: any) => t.title).join(",")} /> }))
vi.mock("@/components/features/project-dialog", () => ({ ProjectDialog: () => null }))

const activities = [
  { id: 1, projectId: 1, order: 1, status: "OPEN", description: "Coleta de dados", firstMonth: "2026-01", lastMonth: "2026-03" },
  { id: 2, projectId: 1, order: 2, status: "COMPLETION_REQUESTED", description: "Revisão da literatura", firstMonth: "2026-02", lastMonth: "2026-04" },
  { id: 3, projectId: 2, order: 1, status: "DONE", description: "Entrega", firstMonth: "2026-01", lastMonth: "2026-02" },
  { id: 4, projectId: 3, order: 1, status: "OPEN", description: "Análise", firstMonth: "2026-02", lastMonth: "2026-03" },
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-11T15:00:00Z"))
  vi.clearAllMocks()
  mocks.auth.user = { id: 99, name: "Coord", roles: ["COORDENADOR"] }
  mocks.projects = [
    { id: 1, name: "Projeto Alpha", description: "Pesquisa ativa", status: "active" },
    { id: 2, name: "Projeto Beta", description: "Pesquisa encerrada", status: "completed" },
    { id: 3, name: "Projeto Gamma", description: "Análise ativa", status: "active" },
  ]
  mocks.tasks = [
    { id: 1, projectId: 1, title: "Alpha da Ana", assignedTo: 10, assigneeIds: [10], status: "done" },
    { id: 2, projectId: 1, title: "Alpha do Bruno", assignedTo: 11, assigneeIds: [11], status: "to-do" },
    { id: 3, projectId: 2, title: "Beta da Ana", assignedTo: 10, assigneeIds: [10], status: "done" },
    { id: 4, projectId: 3, title: "Gamma do Bruno", assignedTo: 11, assigneeIds: [11], status: "in-progress" },
  ]
  mocks.users = [{ id: 10, name: "Ana" }, { id: 11, name: "Bruno" }]
  mocks.fetchAPI.mockResolvedValue({ activities })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("coluna de gráficos da tela Projetos (plan-v23 S05, DEC-269)", () => {
  it("mostra os três cards com a contagem do recorte, a janela de meses e as atrasadas", async () => {
    render(<ProjetosPage />)

    const region = await screen.findByRole("region", { name: "Gráficos do cronograma" })
    expect(screen.getByRole("heading", { name: "Atividades por status" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Atividades por mês" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Atividades atrasadas" })).toBeInTheDocument()

    const donut = within(region).getByRole("img", { name: "Atividades do cronograma por status" })
    expect(within(donut).getByText("4")).toBeInTheDocument()
    expect(within(region).getByText("Aberta")).toBeInTheDocument()
    expect(within(region).getByText("Conclusão solicitada")).toBeInTheDocument()
    expect(within(region).getByText("Concluída")).toBeInTheDocument()

    const rows = region.querySelectorAll("[data-month-row]")
    expect(rows.length).toBe(4)
    expect(rows[0].querySelector("[data-month-label]")?.textContent).toBe("jan/2026")
    expect(rows[0].querySelector("[data-month-count]")?.textContent).toBe("2")
    expect(rows[3].querySelector("[data-month-label]")?.textContent).toBe("abr/2026")
    expect(rows[3].querySelector("[data-month-count]")?.textContent).toBe("1")

    expect(within(region).getByText("3 vencidas")).toBeInTheDocument()
    const lines = region.querySelectorAll("[data-overdue-line]")
    expect(lines.length).toBe(3)
    expect(within(region).getByText(/Coleta de dados/)).toBeInTheDocument()
    expect(within(region).getByText(/Revisão da literatura/)).toBeInTheDocument()
    expect(within(region).getByText(/Análise/)).toBeInTheDocument()
    expect(within(region).queryByText(/Entrega/)).not.toBeInTheDocument()
  })

  it("a coluna obedece ao filtro de pessoa da página", async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProjetosPage />)
    await screen.findByRole("region", { name: "Gráficos do cronograma" })

    await user.selectOptions(screen.getByRole("combobox", { name: "Filtrar por pessoa" }), "10")

    const region = screen.getByRole("region", { name: "Gráficos do cronograma" })
    const donut = within(region).getByRole("img", { name: "Atividades do cronograma por status" })
    expect(within(donut).getByText("3")).toBeInTheDocument()
    expect(within(region).getByText("2 vencidas")).toBeInTheDocument()
    expect(within(region).getByText(/Coleta de dados/)).toBeInTheDocument()
    expect(within(region).queryByText(/Análise/)).not.toBeInTheDocument()
  })

  it("a falha de leitura diz role=alert com retry, não estado vazio", async () => {
    const user = userEvent.setup({ delay: null })
    mocks.fetchAPI.mockRejectedValueOnce(new Error("sem conexão"))
    render(<ProjetosPage />)

    const region = await screen.findByRole("region", { name: "Gráficos do cronograma" })
    expect(within(region).getByRole("alert")).toHaveTextContent("Não foi possível carregar os gráficos do cronograma")
    expect(within(region).queryByRole("heading", { name: "Atividades por status" })).not.toBeInTheDocument()

    await user.click(within(region).getByRole("button", { name: "Tentar de novo" }))
    expect(await within(region).findByRole("heading", { name: "Atividades por status" })).toBeInTheDocument()
  })

  it("a lista de projetos fica antes da coluna no documento", async () => {
    render(<ProjetosPage />)
    const region = await screen.findByRole("region", { name: "Gráficos do cronograma" })
    const list = screen.getByTestId("project-list")
    expect(list.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
