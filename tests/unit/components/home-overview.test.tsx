/**
 * S06 (plan-v11, R6) — a faixa de resumo da Home tem o gráfico sem barra de horas.
 *
 * Por que existe: o card "Atividade da semana" terminava num bloco "Meta da semana" com
 * Progress de horas; o dono pediu o gráfico na faixa e a barra de horas fora. O aceite
 * congela: gráfico presente, barra e textos de meta ausentes, e o feed "Atividade recente"
 * não mora na faixa (mora abaixo do quadro, provado em activity-feed.test.tsx).
 *
 * Harness do arquivo irmão (home-overview-filters): `nuqs` mocked — o adapter de teste não
 * precisa do `hasMemory` aqui porque nenhuma asserção depende de escrita de URL.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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

describe("HomeOverview — gráfico na faixa, sem barra de horas (R6)", () => {
  it("o gráfico 'Atividade da semana' está na faixa de resumo", () => {
    render(<HomeOverview projects={projects} tasks={tasks} />)
    expect(screen.getByText("Atividade da semana")).toBeInTheDocument()
    expect(screen.getByText("Tarefas e subtasks concluídas nos últimos 7 dias")).toBeInTheDocument()
    // O gráfico da casa é `div[role=img]`, não svg (meedido em data-charts.tsx).
    expect(screen.getByRole("img", { name: "Tarefas e subtasks concluídas nos últimos 7 dias" })).toBeInTheDocument()
  })

  it("nenhuma barra de horas de meta semanal no card do gráfico", () => {
    render(<HomeOverview projects={projects} tasks={tasks} />)
    expect(screen.queryByText("Meta da semana")).toBeNull()
    expect(screen.queryByRole("progressbar", { name: /meta semanal/i })).toBeNull()
    expect(screen.queryByText(/% da meta semanal/)).toBeNull()
    expect(screen.queryByText("Defina sua meta no perfil")).toBeNull()
  })

  it("o feed 'Atividade recente' não mora na faixa", () => {
    render(<HomeOverview projects={projects} tasks={tasks} />)
    // `<section aria-label>` mapeia para role "region" na árvore de acessibilidade.
    expect(screen.queryByRole("region", { name: "Atividade recente" })).toBeNull()
  })
});
