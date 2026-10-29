/**
 * S06 (plan-v11, R6) + dono 2026-10-29: a faixa de resumo da Home.
 *
 * O dono trocou os dois cards: o gráfico "Atividade da semana" saiu da faixa e foi para baixo do
 * quadro; o feed "Atividade recente" saiu de baixo do quadro e entrou na faixa. O aceite congela:
 * feed presente na faixa, gráfico ausente da faixa, barra de horas de meta ausente.
 *
 * Harness do arquivo irmão (home-overview-filters): `nuqs` mocked, e o render precisa de QueryClient
 * porque o feed entrou na faixa e usa `useQuery`.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.hoisted(() => ({ filters: {} }))
vi.mock("nuqs", () => ({
  parseAsBoolean: { withDefault: () => ({}) },
  parseAsInteger: {},
  parseAsString: { withDefault: () => ({}) },
  useQueryState: (key: string) => [
    { projeto: null, atrasadas: false, hoje: false, busca: "", pessoa: null, atividade: null }[key] ?? null,
    vi.fn(),
  ],
}))

import { HomeOverview } from "@/features/tasks/components/home-overview"

const projects = [
  { id: 1, name: "Projeto Alfa", createdAt: "2026-10-13T12:00:00.000Z", status: "active" },
]
const tasks = [
  { id: 1, title: "Concluir Alfa", status: "done", assignedTo: 7, assigneeIds: [7], projectId: 1, dueDate: null, completedAt: "2026-10-29T12:00:00Z" },
] as never

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeOverview projects={projects} tasks={tasks} />
    </QueryClientProvider>,
  )
}

describe("HomeOverview — feed na faixa, gráfico fora (R6 + dono 2026-10-29)", () => {
  it("o feed 'Atividade recente' mora na faixa de resumo", () => {
    renderHome()
    // `<section aria-label>` mapeia para role "region" na árvore de acessibilidade.
    expect(screen.getByRole("region", { name: "Atividade recente" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Atividade recente" })).toBeInTheDocument()
  })

  it("o gráfico 'Atividade da semana' não está mais na faixa — foi para baixo do quadro", () => {
    renderHome()
    expect(screen.queryByText("Atividade da semana")).toBeNull()
    expect(screen.queryByRole("img", { name: "Tarefas e subtasks concluídas nos últimos 7 dias" })).toBeNull()
  })

  it("nenhuma barra de horas de meta semanal na faixa", () => {
    renderHome()
    expect(screen.queryByText("Meta da semana")).toBeNull()
    expect(screen.queryByRole("progressbar", { name: /meta semanal/i })).toBeNull()
  })
});
