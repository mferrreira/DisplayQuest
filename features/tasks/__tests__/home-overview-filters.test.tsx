import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { civilDayOfInstant } from "@/backend/domain"

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

// O feed "Atividade recente" entrou no bloco de insights da Home (dono, 2026-10-29) e usa
// `useQuery` — todo render do HomeOverview precisa de um QueryClient. Um cliente novo por teste.
function renderHome(projectsProp: unknown, tasksProp: never) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeOverview projects={projectsProp as never} tasks={tasksProp} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  filters.projeto = null
  filters.atrasadas = false
  filters.hoje = false
  filters.busca = ""
  filters.pessoa = null
  filters.atividade = null
})

describe("HomeOverview filters", () => {
  it("recalcula os gráficos e projetos recentes ao filtrar por pessoa", () => {
    filters.pessoa = 7
    renderHome(projects, tasks)

    expect(screen.getByRole("img", { name: "Distribuição das tarefas por status" })).toBeInTheDocument()
    expect(screen.getByText("50% das tarefas concluídas")).toBeInTheDocument()
    // O gráfico "Atividade da semana" saiu da Home para baixo do quadro; o feed "Atividade
    // recente" entrou no bloco de insights. O feed é o que a faixa mostra nesse ponto.
    expect(screen.getByRole("heading", { name: "Atividade recente" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Projeto Alfa/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Projeto Beta/ })).toBeInTheDocument()
  })

  it("conta atrasadas pela mesma regra do filtro do quadro", () => {
    filters.pessoa = 7
    const atrasada = { id: 99, title: "Atrasada de verdade", status: "to-do", dueDate: "2026-10-01", projectId: 1, assignedTo: 7, assigneeIds: [7] }
    renderHome(projects, [...tasks, atrasada] as never)
    expect(screen.getByText("1 atrasada")).toBeInTheDocument()
    expect(screen.queryByText("2 atrasadas")).not.toBeInTheDocument()
  })

  it("combina projeto e pessoa no mesmo recorte", () => {
    filters.projeto = 1
    filters.pessoa = 7
    renderHome(projects, tasks)

    expect(screen.getByRole("img", { name: "Distribuição das tarefas por status" })).toBeInTheDocument()
    expect(screen.getByText("0% das tarefas concluídas")).toBeInTheDocument()
    expect(screen.getByText("A Fazer").parentElement).toHaveTextContent("1")
    expect(screen.getByRole("link", { name: /Projeto Alfa/ })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Projeto Beta/ })).not.toBeInTheDocument()
  })
})

/**
 * "Atividade da semana" (pedido do dono, 2026-10-22): uma mãe pode ter 50 subtasks e a barra
 * não pode contar a mãe como 1. Conclusão de subtask conta igual à de tarefa, cada uma no dia
 * civil em que aconteceu. O gráfico agora mora embaixo do quadro; a conta é o util
 * `weeklyConclusionBuckets`, provada direto — o título "dia a dia: N conclusões" é o que mede.
 */
describe("weeklyConclusionBuckets — subtask conta igual à tarefa", () => {
  it("a barra do dia soma a tarefa e as subtasks concluídas naquele dia civil", async () => {
    const { weeklyConclusionBuckets } = await import("@/features/tasks/utils/weekly-conclusion-buckets")
    const today = civilDayOfInstant(new Date())
    const noon = (day: string) => `${day}T12:00:00.000Z`
    const daysAgo = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10)
    const yesterday = daysAgo(1)
    const fiveAgo = daysAgo(5)

    const withSubtasks = [
      {
        id: 200,
        title: "Mãe com subtasks",
        status: "done",
        completedAt: noon(today),
        projectId: 1,
        assignedTo: 7,
        assigneeIds: [7],
        dueDate: null,
        subtasks: [
          { id: 1, title: "hoje", completed: true, completedAt: noon(today) },
          { id: 2, title: "ontem", completed: true, completedAt: noon(yesterday) },
          { id: 3, title: "há cinco dias", completed: true, completedAt: noon(fiveAgo) },
          { id: 4, title: "aberta", completed: false, completedAt: null },
        ],
      },
      { id: 201, title: "Feita ontem", status: "done", completedAt: noon(yesterday), dueDate: null },
    ] as never

    const buckets = weeklyConclusionBuckets(withSubtasks, today)
    const byDay = new Map(buckets.map((b) => [b.weekStart, b.count]))
    // hoje = mãe (1) + subtask de hoje (1); ontem = subtask (1) + tarefa 201 (1); há 5 dias só a subtask.
    expect(byDay.get(today)).toBe(2)
    expect(byDay.get(yesterday)).toBe(2)
    expect(byDay.get(fiveAgo)).toBe(1)
  })
})
