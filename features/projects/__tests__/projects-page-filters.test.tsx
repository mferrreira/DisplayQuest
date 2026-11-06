import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ProjetosPage from "@/app/(dashboard)/dashboard/projetos/page"

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 99, name: "Coord", roles: ["COORDENADOR"] } as any },
  projects: [] as any[],
  tasks: [] as any[],
  users: [] as any[],
  push: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: mocks.auth.user }) }))
vi.mock("@/contexts/project-context", () => ({ useProject: () => ({ projects: mocks.projects }) }))
vi.mock("@/contexts/task-context", () => ({ useTask: () => ({ tasks: mocks.tasks }) }))
vi.mock("@/contexts/user-context", () => ({ useUser: () => ({ users: mocks.users }) }))
vi.mock("@/components/features/project-list", () => ({ ProjectList: ({ projects, tasks }: any) => <div data-testid="project-list" data-projects={projects.map((p: any) => p.name).join(",")} data-tasks={tasks.map((t: any) => t.title).join(",")} /> }))
vi.mock("@/components/features/project-dialog", () => ({ ProjectDialog: () => null }))
vi.mock("@/components/features/project-manager-dashboard", () => ({ ProjectManagerDashboard: ({ projects, tasks, scopeDescription }: any) => <div data-testid="project-dashboard" data-projects={projects.map((p: any) => p.name).join(",")} data-tasks={tasks.map((t: any) => t.title).join(",")} data-scope={scopeDescription} /> }))

beforeEach(() => {
  vi.clearAllMocks()
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
})

describe("Projetos sem abas (plan-v18 S04, DEC-249)", () => {
  it("a tela não tem abas e não tem painel de gerente", async () => {
    render(<ProjetosPage />)
    expect(screen.queryAllByRole("tab")).toHaveLength(0)
    expect(screen.queryByTestId("project-dashboard")).not.toBeInTheDocument()
  })

  it("combina busca, status e pessoa no recorte da lista de projetos", async () => {
    const user = userEvent.setup()
    render(<ProjetosPage />)

    await user.type(screen.getByRole("textbox", { name: "Buscar projetos" }), "Projeto")
    await user.click(screen.getByRole("button", { name: /Ativos/ }))
    await user.selectOptions(screen.getByRole("combobox", { name: "Filtrar por pessoa" }), "10")

    expect(screen.getByTestId("project-list")).toHaveAttribute("data-projects", "Projeto Alpha")
    expect(screen.getByTestId("project-list")).toHaveAttribute("data-tasks", "Alpha da Ana")
    expect(screen.getByText("1 projeto")).toBeInTheDocument()
  })
})
